#include <jni.h>
#include <atomic>
#include <memory>
#include <string>
#include <vector>
#include <thread>
#include <stdexcept>
#include <algorithm>
#include "llama.h"

static std::atomic_bool cancelled{false};
static llama_model * model = nullptr;
static std::string loaded;
static std::string utf8(JNIEnv * e, jstring value) {
    // JNI modified UTF-8 corrupts supplementary characters. Convert via Java's UTF-8 codec.
    jclass cls=e->FindClass("java/lang/String");
    jmethodID bytes=e->GetMethodID(cls,"getBytes","(Ljava/lang/String;)[B");
    jstring enc=e->NewStringUTF("UTF-8");
    auto data=(jbyteArray)e->CallObjectMethod(value,bytes,enc);
    std::string result(e->GetArrayLength(data),'\0');
    e->GetByteArrayRegion(data,0,result.size(),reinterpret_cast<jbyte*>(result.data()));
    e->DeleteLocalRef(data);e->DeleteLocalRef(enc);e->DeleteLocalRef(cls); return result;
}
static jstring fromUtf8(JNIEnv * e,const std::string & s) {
    jbyteArray bytes=e->NewByteArray(s.size());
    e->SetByteArrayRegion(bytes,0,s.size(),reinterpret_cast<const jbyte*>(s.data()));
    jclass cls=e->FindClass("java/lang/String");
    jmethodID ctor=e->GetMethodID(cls,"<init>","([BLjava/lang/String;)V");
    jstring enc=e->NewStringUTF("UTF-8");
    jstring result=(jstring)e->NewObject(cls,ctor,bytes,enc);
    e->DeleteLocalRef(bytes);e->DeleteLocalRef(enc);e->DeleteLocalRef(cls);return result;
}
extern "C" JNIEXPORT void JNICALL Java_org_stellarproximology_trident_LocalModel_cancel(JNIEnv*,jclass) { cancelled=true; }
extern "C" JNIEXPORT void JNICALL Java_org_stellarproximology_trident_LocalModel_prepare(JNIEnv*,jclass) { cancelled=false; }
static bool abortInference(void *) { return cancelled.load(); }
extern "C" JNIEXPORT jstring JNICALL Java_org_stellarproximology_trident_LocalModel_generate(JNIEnv * e,jclass,jstring path,jstring prompt,jint stage) {
    try {
        if(cancelled) throw std::runtime_error("Job stopped");
        std::string file=utf8(e,path), text=utf8(e,prompt);
        if(!model || loaded!=file) {
            if(model) { llama_model_free(model);model=nullptr; }
            llama_backend_init();
            auto mp=llama_model_default_params();mp.n_gpu_layers=0;
            model=llama_model_load_from_file(file.c_str(),mp);
            if(!model) throw std::runtime_error("Cannot load bundled GGUF. Check free memory and model integrity.");
            loaded=file;
        }
        auto cp=llama_context_default_params();
        cp.n_ctx=8192;cp.n_batch=256;cp.n_ubatch=256;
        cp.n_threads=std::max(1u,std::min(4u,std::thread::hardware_concurrency()));cp.n_threads_batch=cp.n_threads;
        cp.abort_callback=abortInference;
        std::unique_ptr<llama_context,decltype(&llama_free)> ctx(llama_init_from_model(model,cp),llama_free);
        if(!ctx) throw std::runtime_error("Insufficient memory for Qwen context.");
        const llama_vocab * vocab=llama_model_get_vocab(model);
        int count=-llama_tokenize(vocab,text.data(),text.size(),nullptr,0,true,true);
        if(count<=0 || count>6100) throw std::runtime_error("Context too large. Use fewer or smaller imported files.");
        std::vector<llama_token> tokens(count);
        llama_tokenize(vocab,text.data(),text.size(),tokens.data(),tokens.size(),true,true);
        for(int start=0;start<count;start+=256) {
            if(cancelled) throw std::runtime_error("Job stopped");
            if(llama_decode(ctx.get(),llama_batch_get_one(tokens.data()+start,std::min(256,count-start)))) throw std::runtime_error("Prompt evaluation failed");
        }
        std::string grammar=R"GBNF(root ::= "{" ws "\"action\"" ws ":" ws action ws "," ws "\"name\"" ws ":" ws string ws "," ws "\"content\"" ws ":" ws string ws "}"
action ::= "\"plan\"" | "\"read_file\"" | "\"save_artifact\"" | "\"screen\"" | "\"done\""
string ::= "\"" char* "\""
char ::= [^"\\\x00-\x1F] | "\\" (["\\/bfnrt] | "u" [0-9a-fA-F]{4})
ws ::= [ \t\n\r]*
)GBNF";
        const auto lineStart=grammar.find("action ::=");
        const auto lineEnd=grammar.find('\n',lineStart);
        std::string choices;
        if(stage==0) choices=R"(action ::= "\"plan\"" | "\"done\"")";
        else if(stage==2) choices=R"(action ::= "\"save_artifact\"")";
        else if(stage==3) choices=R"(action ::= "\"done\"")";
        else choices=R"(action ::= "\"read_file\"" | "\"save_artifact\"" | "\"screen\"" | "\"done\"")";
        grammar.replace(lineStart,lineEnd-lineStart,choices);
        auto chain=llama_sampler_chain_init(llama_sampler_chain_default_params());
        auto grammarSampler=llama_sampler_init_grammar(vocab,grammar.c_str(),"root");
        if(!grammarSampler) { llama_sampler_free(chain);throw std::runtime_error("Cannot initialize action grammar"); }
        llama_sampler_chain_add(chain,grammarSampler);
        llama_sampler_chain_add(chain,llama_sampler_init_greedy());
        std::unique_ptr<llama_sampler,decltype(&llama_sampler_free)> sampler(chain,llama_sampler_free);
        std::string output;
        for(int i=0;i<1800;i++) {
            if(cancelled) throw std::runtime_error("Job stopped");
            llama_token next=llama_sampler_sample(sampler.get(),ctx.get(),-1);
            if(llama_vocab_is_eog(vocab,next)) return fromUtf8(e,output);
            char piece[256];int size=llama_token_to_piece(vocab,next,piece,sizeof(piece),0,true);
            if(size<0) { std::vector<char> large(-size);size=llama_token_to_piece(vocab,next,large.data(),large.size(),0,true);output.append(large.data(),size); }
            else output.append(piece,size);
            if(llama_decode(ctx.get(),llama_batch_get_one(&next,1))) throw std::runtime_error("Generation failed");
        }
        throw std::runtime_error("Output reached token limit. Request a smaller file or change.");
    } catch(const std::exception & ex) { e->ThrowNew(e->FindClass("java/lang/IllegalStateException"),ex.what());return nullptr; }
}
