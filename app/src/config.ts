import { Platform } from "react-native";

const BACKEND_PORT = 8001;

// Replace this with your Mac's LAN IP when testing from a physical device.
const PHYSICAL_DEVICE_HOST: string | null = "192.168.1.88";

function defaultBackendHost(): string {
  if (PHYSICAL_DEVICE_HOST) {
    return PHYSICAL_DEVICE_HOST;
  }
  if (Platform.OS === "android") {
    return "10.0.2.2";
  }
  return "127.0.0.1";
}

export const BACKEND_BASE_URL = `http://${defaultBackendHost()}:${BACKEND_PORT}`;
