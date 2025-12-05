import axios from "axios";

// Lấy từ tài khoản OneSignal của bạn
const ONE_SIGNAL_APP_ID = process.env.ONE_SIGNAL_APP_ID;
const ONE_SIGNAL_REST_API_KEY = process.env.ONE_SIGNAL_REST_API_KEY;

const oneSignalClient = axios.create({
  baseURL: "https://api.onesignal.com/api/v1",
  headers: {
    "Content-Type": "application/json; charset=utf-8",
    Authorization: `Basic ${ONE_SIGNAL_REST_API_KEY}`,
  },
});

/**
 * Gửi thông báo đến một danh sách Player ID cụ thể
 */
export const sendNotificationToPlayers = async (
  playerIds,
  headings,
  contents,
  data = {}
) => {
  if (!playerIds || playerIds.length === 0) {
    console.log("Không có Player ID nào để gửi thông báo.");
    return;
  }

  const notification = {
    app_id: ONE_SIGNAL_APP_ID,
    include_player_ids: playerIds,
    headings: headings,
    contents: contents,
    data: data,
  };

  try {
    const response = await oneSignalClient.post("/notifications", notification);
    // Lần này, log SẼ có ID
    // TRONG HÀM sendNotificationToPlayers
    console.log(
      "[Notification Service] Phản hồi ĐẦY ĐỦ từ OneSignal:",
      response.data
    );
  } catch (error) {
    console.error(
      "[Notification Service] Lỗi khi gửi thông báo OneSignal:",
      error.response?.data || error.message
    );
  }
};

/**
 * Gửi thông báo đến một danh sách External User ID cụ thể
 */
export const sendNotificationToExternalIds = async (
  userIds,
  headings,
  contents,
  data = {}
) => {
  if (!userIds || userIds.length === 0) {
    console.log("Không có External User ID nào để gửi thông báo.");
    return;
  }

  const notification = {
    app_id: ONE_SIGNAL_APP_ID, // SỬ DỤNG 'include_external_user_ids' THAY VÌ 'include_player_ids'
    include_external_user_ids: userIds,
    headings: headings,
    contents: contents,
    data: data,
  };

  try {
    const response = await oneSignalClient.post("/notifications", notification);
    console.log(
      "[Notification Service] Gửi thông báo (External ID) thành công:",
      response.data
    );
  } catch (error) {
    console.error(
      "[Notification Service] Lỗi khi gửi thông báo (External ID):",
      error.response?.data || error.message
    );
  }
};
