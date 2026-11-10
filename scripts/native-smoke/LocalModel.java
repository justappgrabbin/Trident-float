package org.stellarproximology.trident;
import java.nio.file.*;
public class LocalModel {
 static { System.loadLibrary("trident_model"); }
 static native void prepare();
 static native void cancel();
 static native String generate(String path,String prompt,int stage);
 public static void main(String[] args) throws Exception {
  if(args[0].equals("--prefix")){System.out.print(AgentPrompts.start(false,false));return;}
  prepare();
  String prompt=Files.readString(Path.of(args[1]));
  System.out.println(generate(args[0],prompt,Integer.parseInt(args[2])));
 }
}
