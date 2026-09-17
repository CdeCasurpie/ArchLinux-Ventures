package com.archventures.archforms;

import android.Manifest;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.net.Uri;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.View;
import android.widget.FrameLayout;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.IOException;
import java.io.RandomAccessFile;
import java.util.UUID;

@CapacitorPlugin(name = "ArchFormsAudio", permissions = {
    @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
})
public class ArchFormsAudioPlugin extends Plugin {
    private static final int SAMPLE_RATE = 16000;
    private AudioRecord recorder;
    private Thread recordingThread;
    private volatile boolean recording;
    private File outputFile;
    private long startedAt;

    @PluginMethod
    public void startRecording(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermission");
            return;
        }
        begin(call);
    }

    @PermissionCallback
    private void microphonePermission(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) begin(call);
        else call.reject("El permiso de micrófono fue rechazado.");
    }

    private void begin(PluginCall call) {
        if (recording) { call.reject("Ya existe una grabación activa."); return; }
        int minimum = AudioRecord.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        if (minimum <= 0) { call.reject("El dispositivo no admite audio PCM a 16 kHz."); return; }
        try {
            File directory = new File(getContext().getFilesDir(), "archforms-lab/audio");
            if (!directory.exists() && !directory.mkdirs()) throw new IOException("No se pudo crear el directorio de audio.");
            outputFile = new File(directory, UUID.randomUUID() + ".wav");
            RandomAccessFile wav = new RandomAccessFile(outputFile, "rw");
            writeHeader(wav, 0);
            recorder = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, SAMPLE_RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, minimum * 2);
            recorder.startRecording();
            recording = true;
            startedAt = System.currentTimeMillis();
            recordingThread = new Thread(() -> writeSamples(wav, minimum * 2), "ArchFormsAudio");
            recordingThread.start();
            call.resolve();
        } catch (Exception error) {
            releaseRecorder();
            call.reject("No se pudo iniciar la grabación nativa.", error);
        }
    }

    private void writeSamples(RandomAccessFile wav, int bufferSize) {
        byte[] buffer = new byte[bufferSize];
        long bytes = 0;
        try {
            while (recording) {
                int read = recorder.read(buffer, 0, buffer.length);
                if (read > 0) { wav.write(buffer, 0, read); bytes += read; }
            }
            writeHeader(wav, bytes);
        } catch (IOException ignored) {
        } finally {
            try { wav.close(); } catch (IOException ignored) {}
        }
    }

    @PluginMethod
    public void stopRecording(PluginCall call) {
        if (!recording || outputFile == null) { call.reject("No existe una grabación activa."); return; }
        recording = false;
        try { recorder.stop(); } catch (Exception ignored) {}
        try { recordingThread.join(2500); } catch (InterruptedException error) { Thread.currentThread().interrupt(); }
        releaseRecorder();
        JSObject result = new JSObject();
        result.put("uri", Uri.fromFile(outputFile).toString());
        result.put("durationMs", System.currentTimeMillis() - startedAt);
        result.put("sizeBytes", outputFile.length());
        result.put("mimeType", "audio/wav");
        call.resolve(result);
    }

    @PluginMethod
    public void deleteRecording(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) { call.reject("Falta uri."); return; }
        File file = new File(Uri.parse(uri).getPath());
        if (file.exists() && !file.delete()) { call.reject("No se pudo eliminar el audio."); return; }
        call.resolve();
    }

    @PluginMethod
    public void updateCameraRect(PluginCall call) {
        Integer x = call.getInt("x");
        Integer y = call.getInt("y");
        Integer width = call.getInt("width");
        Integer height = call.getInt("height");
        if (x == null || y == null || width == null || height == null) {
            call.reject("Faltan las dimensiones del visor.");
            return;
        }
        getActivity().runOnUiThread(() -> {
            View cameraContainer = getActivity().findViewById(20);
            int frameId = getActivity().getResources().getIdentifier("frame_container", "id", getActivity().getPackageName());
            View cameraFrame = cameraContainer == null ? null : cameraContainer.findViewById(frameId);
            if (cameraFrame == null) {
                call.reject("El visor nativo no está activo.");
                return;
            }
            DisplayMetrics metrics = getActivity().getResources().getDisplayMetrics();
            int pxX = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, x, metrics);
            int pxY = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, y, metrics);
            int pxWidth = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, width, metrics);
            int pxHeight = (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, height, metrics);
            FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(pxWidth, pxHeight);
            params.setMargins(pxX, pxY, 0, 0);
            cameraFrame.setLayoutParams(params);
            call.resolve();
        });
    }

    private void releaseRecorder() {
        if (recorder != null) { recorder.release(); recorder = null; }
    }

    private static void writeHeader(RandomAccessFile file, long dataLength) throws IOException {
        file.seek(0);
        int byteRate = SAMPLE_RATE * 2;
        file.writeBytes("RIFF"); writeIntLE(file, (int) dataLength + 36); file.writeBytes("WAVEfmt ");
        writeIntLE(file, 16); writeShortLE(file, 1); writeShortLE(file, 1); writeIntLE(file, SAMPLE_RATE);
        writeIntLE(file, byteRate); writeShortLE(file, 2); writeShortLE(file, 16); file.writeBytes("data"); writeIntLE(file, (int) dataLength);
    }
    private static void writeIntLE(RandomAccessFile file, int value) throws IOException {
        file.write(value); file.write(value >> 8); file.write(value >> 16); file.write(value >> 24);
    }
    private static void writeShortLE(RandomAccessFile file, int value) throws IOException { file.write(value); file.write(value >> 8); }
}
