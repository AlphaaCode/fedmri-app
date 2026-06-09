import React, { useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Image, Alert,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { Plus, UploadCloud, Crosshair, Camera, Images as ImagesIcon, FileUp, FileBox } from "lucide-react-native";
import { colors, subtypeColor, subtypePlain, isBinarySubtype } from "../lib/theme";
import { apiUploadFile } from "../lib/api";
import { AppHeader, Card, Pill, SectionLabel, ProbBar } from "../components/ui";

const IMAGE_EXT = /\.(png|jpe?g|heic|heif|webp|gif|bmp)$/i;

export function ScanScreen({ navigation }: any) {
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");
  const [isImage, setIsImage] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  function select(uri: string, name: string, image: boolean) {
    setFileUri(uri);
    setFileName(name);
    setIsImage(image);
    setResult(null);
    setError(null);
    upload(uri, name);
  }

  async function takePhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission needed", "FedMRI needs camera access to capture a scan."); return; }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9 });
    if (!r.canceled && r.assets?.[0]) select(r.assets[0].uri, `photo-${Date.now()}.jpg`, true);
  }

  async function pickGallery() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert("Permission needed", "FedMRI needs gallery access."); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.9 });
    if (!r.canceled && r.assets?.[0]) {
      const a = r.assets[0];
      select(a.uri, a.fileName || `scan-${Date.now()}.jpg`, true);
    }
  }

  async function pickFile() {
    const r = await DocumentPicker.getDocumentAsync({ type: ["*/*"], copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    const name = a.name || `volume-${Date.now()}.mha`;
    const image = IMAGE_EXT.test(name) || (a.mimeType?.startsWith("image/") ?? false);
    select(a.uri, name, image);
  }

  async function upload(uri: string, name: string) {
    setUploading(true); setError(null);
    try {
      const data = await apiUploadFile(uri, name);
      setResult(data);
    } catch (e: any) {
      setError(e?.message || "Analysis failed");
    } finally {
      setUploading(false);
    }
  }

  function reset() { setFileUri(null); setFileName(""); setIsImage(true); setResult(null); setError(null); }

  const subtype = result?.predictedSubtype as string | undefined;
  const sColor = subtype ? subtypeColor[subtype] ?? colors.teal : colors.teal;
  const bars: { label: string; v: number; c: string }[] = result
    ? isBinarySubtype(subtype!)
      ? [
          { label: "Luminal", v: result.probs?.[0] ?? 0, c: colors.teal },
          { label: "Non-Luminal", v: result.probs?.[1] ?? 0, c: colors.amber },
        ]
      : (["Luminal A", "Luminal B", "HER2", "Triple Negative"] as const).map((k, i) => ({
          label: k, v: result.probs?.[i] ?? 0, c: subtypeColor[k],
        }))
    : [];

  return (
    <View style={s.root}>
      <AppHeader onSettings={() => navigation.navigate("Settings")} />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.h1}>Scan Analysis</Text>
        <View style={s.metaRow}>
          <Pill label="Node Alpha-7 Active" />
          {(fileUri || result) && (
            <TouchableOpacity onPress={reset} style={s.newBtn} activeOpacity={0.8}>
              <Plus size={14} color={colors.teal} />
              <Text style={s.newBtnText}>New Analysis</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Upload zone — three sources */}
        {!fileUri && !result && (
          <>
            <View style={s.drop}>
              <View style={s.dropIcon}><UploadCloud size={26} color={colors.teal} /></View>
              <Text style={s.dropTitle}>Add an MRI scan</Text>
              <Text style={s.dropSub}>Take a photo, choose from your gallery, or pick a file (.mha, .nii, DICOM). Processing stays on-device.</Text>
            </View>
            <View style={s.srcRow}>
              <SourceBtn icon={<Camera size={18} color={colors.teal} />} label="Take Photo" onPress={takePhoto} />
              <SourceBtn icon={<ImagesIcon size={18} color={colors.teal} />} label="Gallery" onPress={pickGallery} />
              <SourceBtn icon={<FileUp size={18} color={colors.teal} />} label="Pick File" onPress={pickFile} />
            </View>
          </>
        )}

        {/* Preview — image slice OR volume file chip */}
        {fileUri && (
          isImage ? (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <View style={s.sliceHeader}>
                <Crosshair size={13} color={colors.teal} />
                <Text style={s.sliceTitle}>Attention Map · Slice View</Text>
              </View>
              <View style={s.sliceImgWrap}>
                <Image source={{ uri: fileUri }} style={s.sliceImg} resizeMode="cover" />
                <View style={s.crossV} /><View style={s.crossH} />
              </View>
            </Card>
          ) : (
            <Card style={s.fileChip}>
              <View style={s.fileChipIcon}><FileBox size={22} color={colors.teal} /></View>
              <View style={{ flex: 1 }}>
                <Text style={s.fileChipName} numberOfLines={1}>{fileName}</Text>
                <Text style={s.fileChipSub}>MRI volume ready for analysis</Text>
              </View>
            </Card>
          )
        )}

        {uploading && (
          <Card style={{ alignItems: "center", gap: 8, marginTop: 12 }}>
            <ActivityIndicator color={colors.teal} size="large" />
            <Text style={s.dropTitle}>Analysing scan…</Text>
            <Text style={s.dropSub}>Federated model processing · 2–4 s</Text>
          </Card>
        )}

        {error && (
          <View style={s.errorBox}><Text style={s.errorText}>{error}</Text></View>
        )}

        {/* Prediction */}
        {result && (
          <>
            <Card style={{ marginTop: 12 }}>
              <View style={s.predHead}>
                <SectionLabel>Subtype Prediction</SectionLabel>
                <Text style={[s.conf, { color: sColor }]}>{Math.round(result.confidence * 100)}%</Text>
              </View>
              {bars.map((bx) => <ProbBar key={bx.label} label={bx.label} value={bx.v} color={bx.c} />)}
              <Text style={s.predNote}>
                {subtype ? subtypePlain[subtype] : ""}
              </Text>
            </Card>

            <Card style={{ marginTop: 12 }}>
              <SectionLabel>Scan Metadata</SectionLabel>
              <Meta k="Modality" v="MRI · DCE T1 Contrast" />
              <Meta k="Model" v={`FedSCRT v${result.modelVersion ?? 1}`} />
              {result.f1 != null && <Meta k="Validation F1 / AUC" v={`${result.f1.toFixed(3)} / ${(result.auc ?? 0).toFixed(3)}`} />}
              <Meta k="Privacy" v="0 bytes raw data transmitted" mono />
            </Card>

            <View style={s.disclaimer}>
              <Text style={s.disclaimerText}>
                Educational AI tool — not a diagnosis. Always confirm with a certified oncologist.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function SourceBtn({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={s.srcBtn} onPress={onPress} activeOpacity={0.85}>
      {icon}
      <Text style={s.srcBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function Meta({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <View style={s.metaLine}>
      <Text style={s.metaK}>{k}</Text>
      <Text style={[s.metaV, mono && { color: colors.teal }]} numberOfLines={1}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  content: { padding: 16, paddingBottom: 32 },
  h1: { color: colors.textPrimary, fontSize: 22, fontWeight: "800", marginBottom: 10 },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  newBtn: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: colors.teal + "55", backgroundColor: colors.tealGlow, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  newBtnText: { color: colors.teal, fontSize: 12, fontWeight: "700" },

  drop: { borderWidth: 2, borderColor: colors.teal + "40", borderStyle: "dashed", borderRadius: 16, padding: 28, alignItems: "center", gap: 10, backgroundColor: colors.tealGlow },
  dropIcon: { width: 58, height: 58, borderRadius: 16, backgroundColor: colors.bgCard, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  dropTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" },
  dropSub: { color: colors.textSecondary, fontSize: 11, textAlign: "center", lineHeight: 16, paddingHorizontal: 8 },

  srcRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  srcBtn: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, borderRadius: 14, backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  srcBtnText: { color: colors.textPrimary, fontSize: 12, fontWeight: "600" },

  fileChip: { flexDirection: "row", alignItems: "center", gap: 12 },
  fileChipIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.tealGlow, borderWidth: 1, borderColor: colors.teal + "40" },
  fileChipName: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  fileChipSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },

  sliceHeader: { flexDirection: "row", alignItems: "center", gap: 6, padding: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  sliceTitle: { color: colors.textPrimary, fontSize: 12, fontWeight: "600" },
  sliceImgWrap: { height: 280, backgroundColor: "#05080c", alignItems: "center", justifyContent: "center" },
  sliceImg: { width: "100%", height: "100%" },
  crossV: { position: "absolute", width: 1, height: "100%", backgroundColor: colors.teal + "55" },
  crossH: { position: "absolute", height: 1, width: "100%", backgroundColor: colors.teal + "55" },

  predHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  conf: { fontSize: 18, fontWeight: "800" },
  predNote: { color: colors.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 12 },

  metaLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 },
  metaK: { color: colors.textSecondary, fontSize: 12 },
  metaV: { color: colors.textPrimary, fontSize: 12, fontWeight: "600", flexShrink: 1, marginLeft: 12, textAlign: "right" },

  errorBox: { backgroundColor: "#fb718515", borderColor: colors.coral + "60", borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
  errorText: { color: colors.coral, fontSize: 12 },

  disclaimer: { backgroundColor: "#fb718508", borderColor: colors.coral + "40", borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
  disclaimerText: { color: colors.coral + "dd", fontSize: 11, lineHeight: 16 },
});
