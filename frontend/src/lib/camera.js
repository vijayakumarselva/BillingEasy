// The device camera, as a File the existing upload code already understands.
//
// A browser can reach the camera through <input capture>, but on iOS that is a
// clumsy detour and Apple reads a wrapped website by whether it uses the
// hardware at all. Inside the app we ask the native camera directly.
import { isCapacitor } from "@/lib/mobile";

export const canTakePhoto = isCapacitor;

/**
 * Open the camera (or the photo library) and return the picture as a File.
 * Returns null when the user backs out — that is not an error.
 *
 * @param {"camera"|"photos"} source
 */
export async function takePhoto(source = "camera") {
  if (!isCapacitor) return null;
  const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");

  const shot = await Camera.getPhoto({
    quality: 72,              // a bill stays readable; the upload stays small
    allowEditing: false,
    correctOrientation: true,
    resultType: CameraResultType.Uri,
    source: source === "photos" ? CameraSource.Photos : CameraSource.Camera,
  });

  const uri = shot.webPath || shot.path;
  if (!uri) return null;
  const blob = await (await fetch(uri)).blob();
  const ext = (shot.format || "jpeg").replace("jpg", "jpeg");
  const name = `bill-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "")}.${ext === "jpeg" ? "jpg" : ext}`;
  return new File([blob], name, { type: blob.type || `image/${ext}` });
}

/** True when the user refused camera access, so we can say so plainly. */
export function wasDenied(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("denied") || msg.includes("permission") || msg.includes("not authorized");
}
