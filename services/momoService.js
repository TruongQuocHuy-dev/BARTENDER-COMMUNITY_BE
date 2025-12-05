// services/momoService.js
import crypto from "crypto";

/**
 * @desc    Tạo URL thanh toán MoMo (API v2 - Pay With QR)
 * @param   {object} data - { amount, orderId, orderInfo, requestId }
 * @returns {string} payUrl
 */
export const createMomoPaymentUrl = async ({
  amount,
  orderId,
  orderInfo,
  requestId,
}) => {
  // 1. Lấy thông tin cấu hình từ .env
  const partnerCode = process.env.MOMO_PARTNER_CODE;
  const accessKey = process.env.MOMO_ACCESS_KEY;
  const secretKey = process.env.MOMO_SECRET_KEY;
  const apiEndpoint = process.env.MOMO_API_ENDPOINT;
  const notifyUrl = process.env.MOMO_NOTIFY_URL; // Webhook
  const redirectUrl = process.env.MOMO_REDIRECT_URL; // Link FE

  // 2. Chuẩn bị dữ liệu
  const requestType = "payWithATM";
  const lang = "vi";
  const extraData = ""; // Không dùng

  // 3. Tạo chuỗi "thô" (raw) để hash (Thứ tự BẮT BUỘC theo tài liệu MoMo)
  const rawSignature =
    `accessKey=${accessKey}` +
    `&amount=${amount}` +
    `&extraData=${extraData}` +
    `&ipnUrl=${notifyUrl}` +
    `&orderId=${orderId}` +
    `&orderInfo=${orderInfo}` +
    `&partnerCode=${partnerCode}` +
    `&redirectUrl=${redirectUrl}` +
    `&requestId=${requestId}` +
    `&requestType=${requestType}`;

  // 4. Tạo chữ ký (Hash) SHA256
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(rawSignature)
    .digest("hex");

  // 5. Chuẩn bị body để POST lên server MoMo
  const requestBody = JSON.stringify({
    partnerCode: partnerCode,
    requestId: requestId,
    amount: amount,
    orderId: orderId,
    orderInfo: orderInfo,
    redirectUrl: redirectUrl,
    ipnUrl: notifyUrl,
    requestType: requestType,
    extraData: extraData,
    lang: lang,
    signature: signature,
  });

  console.log("ĐANG GỬI REQUEST ĐẾN MOMO:", requestBody);

  // 6. Gọi API của MoMo để lấy link thanh toán
  try {
    const response = await fetch(apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(requestBody),
      },
      body: requestBody,
    });

    const data = await response.json();

    if (data.resultCode !== 0) {
      // 0 là thành công, khác 0 là lỗi
      throw new Error(`MoMo Error: ${data.message} (Code: ${data.resultCode})`);
    }

    console.log("PHẢN HỒI TỪ MOMO:", JSON.stringify(data, null, 2));

    // 7. Trả về payUrl (để FE mở WebView)
    return data.payUrl;
  } catch (err) {
    console.error("Lỗi tạo link MoMo:", err);
    throw new Error("Không thể tạo link thanh toán MoMo");
  }
};

/**
 * @desc    Xác thực chữ ký từ MoMo IPN
 * @param   {object} body - req.body từ MoMo
 * @returns {boolean}
 */
export const verifyMomoSignature = (body) => {
  const accessKey = process.env.MOMO_ACCESS_KEY;
  const secretKey = process.env.MOMO_SECRET_KEY;
  const momoSignature = body.signature;

  // Log body để debug
  console.log("Body nhận từ MoMo để check Sig:", JSON.stringify(body, null, 2));

  // 👇 SỬA LỖI Ở ĐÂY: Thêm dấu & vào trước amount
  const rawSignature =
    `accessKey=${accessKey}` +
    `&amount=${body.amount}` + // 👈 ĐÃ THÊM DẤU &
    `&extraData=${body.extraData || ""}` +
    `&message=${body.message || ""}` +
    `&orderId=${body.orderId}` +
    `&orderInfo=${body.orderInfo}` +
    `&orderType=${body.orderType}` +
    `&partnerCode=${body.partnerCode}` +
    `&payType=${body.payType}` +
    `&requestId=${body.requestId}` +
    `&responseTime=${body.responseTime}` +
    `&resultCode=${body.resultCode}` +
    `&transId=${body.transId}`;

  console.log("Raw Signature Server tạo:", rawSignature);

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(rawSignature)
    .digest("hex");

  console.log("Hash Server tính:", calculatedHash);
  console.log("Hash MoMo gửi:", momoSignature);

  return momoSignature === calculatedHash;
};