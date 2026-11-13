"use strict";
/**
 * ============================================================
 * SENSORY INPUT ADAPTER — DISEMINER's Eyes
 * Ported from Python + upgraded for structured observation
 *
 * Principle: RAW MEASUREMENT FIRST → relationships second →
 *            interpretation third → AUTOLING names it last.
 *
 * Sight upgrade: returns structured observations instead of
 * a single brightness number. DISEMINER learns from:
 *   { objects, relations, changes, timestamp, frameEmbedding }
 * ============================================================
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SensoryInputAdapter = void 0;
class SensoryInputAdapter {
    calibration;
    constructor(calibration) {
        this.calibration = {
            smell: {
                scale: 1.0,
                offset: 0.0,
                chemicalMap: {
                    VOC_total: [1, 0, 0], // X axis: horizontal spread
                    CO2: [0, 1, 0], // Y axis: breath/life (BUT: raw first, interpret later)
                    NH3: [0, 0, 1], // Z axis: sharp/pungent (BUT: raw first, interpret later)
                    ethanol: [0, 0, 1],
                    acetone: [0, 0, 0.5],
                },
            },
            taste: {
                scale: 1.0,
                offset: 0.0,
                propertyWeights: {
                    pH: 0.3,
                    sweetness: 0.4,
                    bitterness: -0.5,
                    salinity: 0.2,
                    umami: 0.3,
                    sourness: -0.4,
                },
            },
            touch: {
                pressureScale: 2.0,
                tempBaseline: 25,
                tempScale: 20,
            },
            sight: {
                resolution: [256, 256],
                embeddingDim: 64,
            },
            hearing: {
                sampleRate: 16000,
                freqScale: 20000,
            },
            ...calibration,
        };
    }
    /**
     * SMELL: Convert chemical sensor readings to raw 3D gradient.
     * Downstream systems decide what the axes MEAN.
     */
    smellFromChemicalData(chemicalReadings) {
        const gradient = new Float32Array(3);
        for (const [chemical, reading] of Object.entries(chemicalReadings)) {
            const axis = this.calibration.smell.chemicalMap[chemical];
            if (axis) {
                const normalized = this.normalizeChemical(reading, 0, 1000);
                gradient[0] += axis[0] * normalized;
                gradient[1] += axis[1] * normalized;
                gradient[2] += axis[2] * normalized;
            }
        }
        return {
            values: chemicalReadings,
            source: 'smell',
            timestamp: Date.now(),
        };
    }
    /**
     * TASTE: Convert chemical properties to raw alignment score.
     * BUT: preserve all raw properties in the measurement.
     */
    tasteFromChemicalData(substanceData) {
        let alignment = 0.0;
        for (const [property, weight] of Object.entries(this.calibration.taste.propertyWeights)) {
            if (property === 'pH' && substanceData.pH !== undefined) {
                const pH = substanceData.pH;
                const pHScore = 1.0 - Math.abs(pH - 7.0) / 7.0;
                alignment += pHScore * weight;
            }
            else if (substanceData[property] !== undefined) {
                alignment += substanceData[property] * weight;
            }
        }
        return {
            values: { ...substanceData, _alignment: Math.tanh(alignment) },
            source: 'taste',
            timestamp: Date.now(),
        };
    }
    /**
     * TOUCH: Convert physical sensor readings to raw measurement.
     * Curvature is computed, but raw pressure/temperature preserved.
     */
    touchFromSensorData(sensorData) {
        let curvature = 0.0;
        if (sensorData.pressure !== undefined) {
            curvature += sensorData.pressure * this.calibration.touch.pressureScale - 1.0;
        }
        if (sensorData.temperature !== undefined) {
            const tempDiff = (sensorData.temperature - this.calibration.touch.tempBaseline) / this.calibration.touch.tempScale;
            curvature += tempDiff * 0.5;
        }
        return {
            values: { ...sensorData, _curvature: curvature },
            source: 'touch',
            timestamp: Date.now(),
        };
    }
    /**
     * SIGHT — UPGRADED: Returns structured observation, not just brightness.
     *
     * Input: visual data (frame pixels, object detections, state deltas)
     * Output: StructuredObservation with objects, relations, changes.
     *
     * This is where DISEMINER gets its eyes.
     */
    sightFromVisualData(visualData) {
        const timestamp = Date.now();
        // Build object list
        const objects = (visualData.objects || []).map((obj) => ({
            id: obj.id,
            position: { x: obj.x, y: obj.y },
            velocity: { x: obj.vx || 0, y: obj.vy || 0 },
            appearanceEmbedding: new Float32Array(obj.embedding || this.hashEmbedding(obj.id)),
            confidence: obj.confidence || 0.8,
            boundingBox: { x: obj.x, y: obj.y, width: obj.width, height: obj.height },
        }));
        // Build relation list
        const relations = (visualData.relations || []).map((rel) => ({
            subject: rel.subject,
            predicate: rel.predicate,
            object: rel.object,
            confidence: rel.confidence || 0.8,
            frameIndex: visualData.frameIndex,
        }));
        // Build change list
        const changes = (visualData.stateChanges || []).map((chg) => ({
            subject: chg.subject,
            property: chg.property,
            before: chg.before,
            after: chg.after,
            delta: typeof chg.before === 'number' && typeof chg.after === 'number'
                ? chg.after - chg.before
                : 0,
            cause: chg.cause,
        }));
        // Compute frame embedding from objects (deterministic)
        const frameEmbedding = this.computeFrameEmbedding(objects, visualData.frameIndex);
        return {
            timestamp,
            frameIndex: visualData.frameIndex,
            frameEmbedding,
            objects,
            relations,
            changes,
            raw: {
                values: { brightness: this.computeBrightness(visualData.pixels), objectCount: objects.length },
                source: 'sight',
                timestamp,
            },
        };
    }
    /**
     * HEARING: Convert audio sensor data to frequency.
     * Raw spectrum preserved, peak frequency computed.
     */
    hearingFromAudioData(audioData) {
        let freq = 440.0;
        if (audioData.frequency !== undefined) {
            freq = audioData.frequency;
        }
        else if (audioData.spectrum !== undefined) {
            const spectrum = audioData.spectrum;
            let peakIdx = 0;
            let peakVal = -Infinity;
            for (let i = 0; i < spectrum.length; i++) {
                if (spectrum[i] > peakVal) {
                    peakVal = spectrum[i];
                    peakIdx = i;
                }
            }
            freq = (peakIdx / spectrum.length) * this.calibration.hearing.freqScale;
        }
        return {
            values: {
                ...(audioData.frequency !== undefined ? { frequency: audioData.frequency } : {}),
                ...(audioData.amplitude !== undefined ? { amplitude: audioData.amplitude } : {}),
                _dominantFrequency: freq,
            },
            source: 'hearing',
            timestamp: Date.now(),
        };
    }
    /**
     * Create a complete perception packet from all available sensors.
     * Returns both raw measurements AND structured sight observation.
     */
    createPerceptionFromSensors(inputs) {
        const perception = {};
        if (inputs.smell)
            perception.smell = this.smellFromChemicalData(inputs.smell);
        if (inputs.taste)
            perception.taste = this.tasteFromChemicalData(inputs.taste);
        if (inputs.touch)
            perception.touch = this.touchFromSensorData(inputs.touch);
        if (inputs.sight)
            perception.sight = this.sightFromVisualData(inputs.sight);
        if (inputs.hearing)
            perception.hearing = this.hearingFromAudioData(inputs.hearing);
        return perception;
    }
    // ───────────────────────────────────────────────────────
    // Private helpers
    // ───────────────────────────────────────────────────────
    normalizeChemical(value, minVal, maxVal) {
        const normalized = (value - minVal) / (maxVal - minVal);
        return normalized * 2 - 1; // [-1, 1]
    }
    hashEmbedding(id) {
        // Deterministic embedding from string hash
        const emb = new Array(this.calibration.sight.embeddingDim).fill(0);
        let hash = 0;
        for (let i = 0; i < id.length; i++) {
            hash = ((hash << 5) - hash) + id.charCodeAt(i);
            hash |= 0;
        }
        for (let i = 0; i < emb.length; i++) {
            hash = ((hash * 31) + i) | 0;
            emb[i] = (Math.abs(hash) % 1000) / 1000;
        }
        return emb;
    }
    computeFrameEmbedding(objects, frameIndex) {
        const dim = this.calibration.sight.embeddingDim;
        const emb = new Float32Array(dim);
        for (const obj of objects) {
            for (let i = 0; i < dim; i++) {
                emb[i] += obj.appearanceEmbedding[i % obj.appearanceEmbedding.length] * obj.confidence;
            }
        }
        // Incorporate frame index for temporal encoding
        for (let i = 0; i < dim; i++) {
            emb[i] += Math.sin(frameIndex * 0.1 + i * 0.5) * 0.1;
        }
        // Normalize
        const norm = Math.sqrt(emb.reduce((s, v) => s + v * v, 0));
        if (norm > 0) {
            for (let i = 0; i < dim; i++)
                emb[i] /= norm;
        }
        return emb;
    }
    computeBrightness(pixels) {
        if (!pixels || pixels.length === 0)
            return 0.5;
        let sum = 0;
        for (let i = 0; i < pixels.length; i += 3) {
            sum += (pixels[i] + (pixels[i + 1] || 0) + (pixels[i + 2] || 0)) / 3;
        }
        return sum / (pixels.length / 3) / 255;
    }
}
exports.SensoryInputAdapter = SensoryInputAdapter;
exports.default = SensoryInputAdapter;
//# sourceMappingURL=sensory-adapter.js.map
