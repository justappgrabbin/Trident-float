package org.stellarproximology.trident;

import android.app.*;
import android.content.*;
import android.os.*;

public final class BridgeForegroundService extends Service {
    private AgentRunner runner;
    private NotificationManager notifications;
    static final String KICK="trident.KICK", STOP="trident.STOP";
    @Override public void onCreate() {
        super.onCreate();notifications=getSystemService(NotificationManager.class);
        notifications.createNotificationChannel(new NotificationChannel("trident_work","Trident background work",NotificationManager.IMPORTANCE_LOW));
        notifications.createNotificationChannel(new NotificationChannel("trident_results","Deliveries and attention",NotificationManager.IMPORTANCE_DEFAULT));
        startForeground(58,notification("Trident is ready","Qwen Coder runs on this phone",null,"trident_work",true));
        try { AgentStore.get(this).recover(); }
        catch(Exception e){notifyResult("Saved jobs need attention",e.getMessage());stopSelf();return;}
        runner=new AgentRunner(this,(job,text,attention)-> {
            if(attention)notifyResult("Trident",text);
            else notifications.notify(58,notification("Trident is working",text,job,"trident_work",true));
        });
    }
    private Notification notification(String title,String text,String job,String channel,boolean ongoing) {
        Intent open=new Intent(this,MainActivity.class);
        PendingIntent tap=PendingIntent.getActivity(this,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b=new Notification.Builder(this,channel).setContentTitle(title).setContentText(text)
            .setStyle(new Notification.BigTextStyle().bigText(text)).setSmallIcon(R.drawable.trident_planet).setContentIntent(tap).setOngoing(ongoing).setOnlyAlertOnce(ongoing);
        if(job!=null&&!job.isEmpty()) {
            Intent stop=new Intent(this,BridgeForegroundService.class).setAction(STOP).putExtra("job",job);
            PendingIntent cancel=PendingIntent.getService(this,1,stop,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
            b.addAction(new Notification.Action.Builder(null,"Stop job",cancel).build());
        }
        return b.build();
    }
    private void notifyResult(String title,String text) {
        try {notifications.notify((int)(System.currentTimeMillis()%100000)+100,notification(title,text,null,"trident_results",false));}
        catch(SecurityException ignored){} // Notifications may be declined; progress remains in the journal.
        notifications.notify(58,notification("Trident · work saved","Open Inbox to review progress and deliveries",null,"trident_work",true));
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId) {
        if(runner==null){stopSelf();return START_NOT_STICKY;}
        if(intent!=null&&STOP.equals(intent.getAction()))try{runner.stop(intent.getStringExtra("job"));}catch(Exception e){notifyResult("Could not stop job",e.getMessage());}
        runner.kick();return START_STICKY;
    }
    @Override public void onDestroy(){if(runner!=null)runner.close();super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
