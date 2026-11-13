"""
ADAPTER (not donor logic): child-process boundary for the vendored Synthai2
ephemeris.py donor (see computer/donors/recovered/synthai2-ephemeris/PROVENANCE.md).
Reads JSON on argv[1]: {"members": [{birth_date, birth_time}, ...], "ephemeris_path": "..."}
Writes JSON to stdout: per-member real PyEphem trinity gates + donor calc_penta
role, plus group penta completion (needed positions = {1..5} - filled).
The penta POSITION FORMULA in the donor is a documented PLACEHOLDER hash
((body+mind+heart)%5+1); gates/coordinates are REAL PyEphem triple-zodiac.
Exit 3 with {"error": ...} if the donor cannot run (e.g. pyephem missing).
"""
import json
import sys

def main():
    try:
        req = json.loads(sys.argv[1])
        sys.path.insert(0, req["ephemeris_path"])
        import ephemeris  # vendored donor, unmodified
    except Exception as e:
        print(json.dumps({"error": f"penta donor unavailable: {e}"}))
        sys.exit(3)

    members = []
    for m in req["members"]:
        calc = ephemeris.TrinityCalculator(
            m["birth_date"], m.get("birth_time", "00:00"),
            m.get("latitude", 0.0), m.get("longitude", 0.0), m.get("timezone_offset", 0.0),
        )
        report = calc.generate_trinity_report()  # real donor computation
        members.append({
            "label": m.get("label"),
            "body_gate": report["body"]["gate"],
            "mind_gate": report["mind"]["gate"],
            "heart_gate": report["heart"]["gate"],
            "penta": report["penta"],  # donor calc_penta result (placeholder position formula — flagged)
        })
    filled = sorted({m["penta"]["pos"] for m in members})
    needed = sorted({1, 2, 3, 4, 5} - set(filled))
    print(json.dumps({
        "members": members,
        "filled_positions": filled,
        "needed_positions": needed,
        "needed_names": [ephemeris.PENTA_NAMES[p] for p in needed],
        "position_formula": "PLACEHOLDER (donor: (body+mind+heart)%5+1) — group logic real",
    }))

if __name__ == "__main__":
    main()

