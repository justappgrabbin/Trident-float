package org.stellarproximology.trident;

import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;

final class JsonHttp {
    static JSONObject request(String address, JSONObject body, String token) throws Exception {
        HttpURLConnection c=(HttpURLConnection)new URL(address).openConnection();
        c.setInstanceFollowRedirects(false);c.setConnectTimeout(10000);c.setReadTimeout(30000);
        c.setRequestProperty("Accept","application/json");c.setRequestProperty("User-Agent","Trident-Android/0.4");
        if(token!=null&&!token.isEmpty())c.setRequestProperty("Authorization","Bearer "+token);
        try {
            if(body!=null) {
                c.setRequestMethod("POST");c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");
                byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8);c.setFixedLengthStreamingMode(bytes.length);
                try(OutputStream out=c.getOutputStream()){out.write(bytes);}
            }
            int status=c.getResponseCode();
            try(InputStream in=status>=400?c.getErrorStream():c.getInputStream()) {
                if(in==null)throw new IOException("HTTP "+status);
                ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] chunk=new byte[8192];int n;
                while((n=in.read(chunk))!=-1){if(out.size()+n>4_000_000)throw new IOException("Response exceeds 4 MB");out.write(chunk,0,n);}
                if(status<200||status>=300)throw new IOException("HTTP "+status+" from "+new URI(address).getHost());
                return out.size()==0 ? new JSONObject() : new JSONObject(out.toString("UTF-8"));
            }
        } finally {c.disconnect();}
    }
    static String endpoint(String value) throws Exception {
        URI u=new URI(value.trim());String h=u.getHost();
        if(h==null||u.getRawUserInfo()!=null||u.getRawFragment()!=null||u.getRawQuery()!=null)throw new IllegalArgumentException("Enter an MCP URL without credentials, query or fragment.");
        if(!"https".equals(u.getScheme())&&!"http".equals(u.getScheme()))throw new IllegalArgumentException("MCP requires HTTP or HTTPS.");
        if("http".equals(u.getScheme())&&!privateHost(h))throw new IllegalArgumentException("Use HTTPS unless the server is on localhost or a private LAN IP.");
        return u.toString();
    }
    private static boolean privateHost(String h) {
        if(h.equals("localhost")||h.equals("127.0.0.1")||h.equals("[::1]")||h.equals("::1"))return true;
        if(!h.matches("[0-9]+\\.[0-9]+\\.[0-9]+\\.[0-9]+"))return false;
        String[] a=h.split("\\.");int[] n=new int[4];for(int i=0;i<4;i++){n[i]=Integer.parseInt(a[i]);if(n[i]>255)return false;}
        return n[0]==10||(n[0]==192&&n[1]==168)||(n[0]==172&&n[1]>=16&&n[1]<=31);
    }
}
