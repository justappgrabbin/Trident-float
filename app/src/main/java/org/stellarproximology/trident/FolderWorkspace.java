package org.stellarproximology.trident;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import java.io.*;
import java.nio.charset.*;
import java.nio.ByteBuffer;
import java.util.*;

/** SAF capability: only the selected tree, only reads, no write/delete grant. */
final class FolderWorkspace {
    private final Context app;
    private final Uri tree;
    FolderWorkspace(Context c,String uri){app=c;tree=Uri.parse(uri);}
    private static final String[] COLS={DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE};
    private Map<String,Uri> files() throws Exception {
        Map<String,Uri> out=new LinkedHashMap<>();walk(DocumentsContract.getTreeDocumentId(tree),"",0,out);return out;
    }
    private void walk(String id,String prefix,int depth,Map<String,Uri> out) throws Exception {
        if(depth>3||out.size()>=150)return;
        Uri children=DocumentsContract.buildChildDocumentsUriUsingTree(tree,id);
        try(Cursor cursor=app.getContentResolver().query(children,COLS,null,null,null)) {
            if(cursor==null)throw new IOException("Folder provider is unavailable.");
            while(cursor.moveToNext()&&out.size()<150) {
                String child=cursor.getString(0),name=cursor.getString(1),mime=cursor.getString(2),path=prefix+name;
                if(name==null||name.contains("/")||name.equals(".")||name.equals(".."))continue;
                if(DocumentsContract.Document.MIME_TYPE_DIR.equals(mime)) {
                    if(!name.startsWith(".")&&!Arrays.asList("node_modules","build","vendor","dist").contains(name))walk(child,path+"/",depth+1,out);
                } else out.put(path,DocumentsContract.buildDocumentUriUsingTree(tree,child));
            }
        }
    }
    String list() throws Exception {return "Connected folder (first 150 files, depth 3). Read with folder:path\n"+String.join("\n",files().keySet());}
    String read(String path) throws Exception {
        if(!ToolPolicy.validArtifactPath(path))throw new SecurityException("Invalid relative folder path");
        Uri uri=files().get(path);if(uri==null)throw new FileNotFoundException("File not found in selected folder");
        return readText(app,uri);
    }
    static String readText(Context c,Uri uri) throws Exception {
        try(InputStream in=c.getContentResolver().openInputStream(uri)) {
            if(in==null)throw new IOException("Document provider returned no data");
            ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[8192];int n;
            while((n=in.read(buffer))!=-1){if(out.size()+n>256000)throw new IOException("File exceeds the 256 KB text limit. Choose a smaller source file.");out.write(buffer,0,n);}
            byte[] bytes=out.toByteArray();for(byte b:bytes)if(b==0)throw new IOException("This is a binary file. Only UTF-8 source/text files can be fixed.");
            return StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString();
        }
    }
}
