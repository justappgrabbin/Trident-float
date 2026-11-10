package org.stellarproximology.trident;

import org.json.*;
import java.util.*;

/** Stateless Streamable HTTP/JSON MCP client, compatible with Android-mcp. */
final class McpClient {
    private final String endpoint,token;
    private final Set<String> advertised=new HashSet<>();
    private static final Set<String> COMPUTER=new HashSet<>(Arrays.asList("workspace_list","workspace_read","computer_screenshot"));
    private final boolean computer;
    McpClient(String endpoint,String token,boolean computer) throws Exception {
        this.endpoint=JsonHttp.endpoint(endpoint);this.token=token;this.computer=computer;
        rpc("initialize",new JSONObject().put("protocolVersion","2025-03-26").put("capabilities",new JSONObject())
            .put("clientInfo",new JSONObject().put("name","trident").put("version","0.4")));
        notifyInitialized();
        JSONArray tools=rpc("tools/list",new JSONObject()).getJSONArray("tools");
        for(int i=0;i<tools.length();i++) {
            String name=tools.getJSONObject(i).getString("name");
            if(permitted(name))advertised.add(name);
        }
    }
    private boolean permitted(String name){return computer?COMPUTER.contains(name):ToolPolicy.permitsMcp(name);}
    String tools(){return advertised.toString();}
    JSONObject call(String name,JSONObject arguments) throws Exception {
        if(!permitted(name)||!advertised.contains(name))throw new SecurityException("MCP capability blocked by no-delete policy: "+name);
        JSONObject r=rpc("tools/call",new JSONObject().put("name",name).put("arguments",arguments));
        if(r.optBoolean("isError"))throw new IllegalStateException("MCP tool reported an error: "+r.optJSONArray("content"));
        return r;
    }
    private void notifyInitialized() throws Exception {
        JsonHttp.request(endpoint,new JSONObject().put("jsonrpc","2.0").put("method","notifications/initialized"),token);
    }
    private JSONObject rpc(String method,JSONObject params) throws Exception {
        JSONObject r=JsonHttp.request(endpoint,new JSONObject().put("jsonrpc","2.0").put("id",AgentStore.id()).put("method",method).put("params",params),token);
        if(r.has("error"))throw new IllegalStateException("MCP error: "+r.getJSONObject("error").optString("message"));
        return r.getJSONObject("result");
    }
    static String text(JSONObject result) {
        StringBuilder out=new StringBuilder();JSONArray items=result.optJSONArray("content");
        if(items!=null)for(int i=0;i<items.length();i++){JSONObject p=items.optJSONObject(i);if(p!=null&&"text".equals(p.optString("type")))out.append(p.optString("text")).append('\n');}
        return out.substring(0,Math.min(10000,out.length()));
    }
}
