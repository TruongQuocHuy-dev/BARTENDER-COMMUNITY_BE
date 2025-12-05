import crypto from "crypto";
import qs from "qs";
import moment from "moment-timezone";

// 👇 HÀM 1: Lấy từ code mẫu của bạn (ĐÃ FIX)
// Hàm này sắp xếp VÀ mã hóa (encode)
function sortObject(obj) {
  let sorted = {};
  let str = [];
  let key;
  for (key in obj) {
    
    // 👇👇👇 THAY ĐỔI DUY NHẤT TẠI ĐÂY 👇👇👇
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
    // 👆👆👆 THAY ĐỔI DUY NHẤT TẠI ĐÂY 👆👆👆

      str.push(encodeURIComponent(key));
    }
  }
  str.sort();
  for (key = 0; key < str.length; key++) {
    sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+");
  }
  return sorted;
}

/**
 * @desc    Tạo URL thanh toán VNPay
 * @param   {object} data - { amount, orderId, orderInfo, ipAddr }
 * @returns {string} paymentUrl
 */
export const createVnpayPaymentUrl = ({ amount, orderId, orderInfo, ipAddr }) => {
  const tmnCode = process.env.VNP_TMN_CODE;
  const secretKey = process.env.VNP_HASH_SECRET;
  const vnpUrl = process.env.VNP_URL;
  const returnUrl = process.env.VNP_RETURN_URL;

  if (!tmnCode || !secretKey || !vnpUrl || !returnUrl) {
    console.error("!!! LỖI CẤU HÌNH VNPAY: Thiếu biến .env !!!");
    throw new Error("Cấu hình VNPay .env bị thiếu.");
  }

  const createDate = moment().tz("Asia/Ho_Chi_Minh").format("YYYYMMDDHHmmss");
  
  let vnp_Params = {
    vnp_Version: "2.1.0",
    vnp_Command: "pay",
    vnp_TmnCode: tmnCode,
    vnp_Locale: "vn",
    vnp_CurrCode: "VND",
    vnp_TxnRef: orderId,
    vnp_OrderInfo: orderInfo, // Dùng mô tả đã làm sạch (không dấu)
    vnp_OrderType: "other",
    vnp_Amount: amount * 100,
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr,
    vnp_CreateDate: createDate,
  };
  
  // 👇 HÀM 2: Sắp xếp VÀ mã hóa (dùng hàm mới)
  const sorted_Params = sortObject(vnp_Params);
  
  // 3. Tạo chuỗi signData (KHÔNG encode)
  const signData = qs.stringify(sorted_Params, { 
    arrayFormat: 'brackets', 
    encode: false // Quan trọng: vì đã encode ở sortObject
  });
  
  // 4. Tạo chữ ký
  const hmac = crypto.createHmac("sha512", secretKey);
  const vnp_SecureHash = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

  // 5. Thêm chữ ký vào params (đã sắp xếp)
  sorted_Params['vnp_SecureHash'] = vnp_SecureHash;
  
  // 6. Tạo URL cuối cùng (KHÔNG encode)
  const paymentUrl = vnpUrl + "?" + qs.stringify(sorted_Params, { 
    arrayFormat: 'brackets',
    encode: false // Quan trọng: vì đã encode ở sortObject
  });

  return paymentUrl;
};

/**
 * @desc    Xác thực chữ ký từ VNPay IPN
 * @param   {object} vnp_Params - req.query từ VNPay
 * @returns {boolean}
 */
export const verifyVnpaySignature = (vnp_Params) => {
  const secretKey = process.env.VNP_HASH_SECRET;
  
  const vnp_SecureHash = vnp_Params['vnp_SecureHash'];

  delete vnp_Params['vnp_SecureHash'];
  delete vnp_Params['vnp_SecureHashType'];

  // 👇 HÀM 3: Sắp xếp VÀ mã hóa (dùng hàm mới)
  const sorted_Params = sortObject(vnp_Params);

  // 4. Tạo chuỗi query (không encode)
  const signData = qs.stringify(sorted_Params, { 
    arrayFormat: 'brackets', 
    encode: false 
  });
  
  const hmac = crypto.createHmac("sha512", secretKey);
  const calculatedHash = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

  return vnp_SecureHash === calculatedHash;
};