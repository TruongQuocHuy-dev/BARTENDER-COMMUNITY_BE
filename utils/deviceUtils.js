// utils/deviceUtils.js
import DeviceDetector from "node-device-detector";
import requestIp from "request-ip";

const detector = new DeviceDetector();

export const parseDevice = (req) => {
  const userAgent = req.headers["user-agent"] || "";
  const ip = requestIp.getClientIp(req) || req.ip || "";

  const result = detector.detect(userAgent);

  return {
    name:
      result.device?.brand && result.device?.model
        ? `${result.device.brand} ${result.device.model}`
        : result.device?.type || "Unknown Device",
    os: result.os?.name || "?",
    browser: result.client?.name || "?",
    ip,
  };
};
