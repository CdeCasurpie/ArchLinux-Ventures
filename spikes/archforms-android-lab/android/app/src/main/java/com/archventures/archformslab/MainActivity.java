package com.archventures.archformslab;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ArchFormsAudioPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
