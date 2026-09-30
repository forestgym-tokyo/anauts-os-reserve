/**
 * ============================================================
 * A-nauts OS Reserve
 * 47_TourCustomerReply.gs
 *
 * 店内見学者への管理画面返信メール
 * 送信元: info@theforestgym.com
 * ============================================================
 */

const TOUR_REPLY_FROM_EMAIL =
  "info@theforestgym.com";

const TOUR_REPLY_FROM_NAME =
  "The Forest Gym 八千代緑が丘店";


/**
 * 店内見学者へメールを送信
 *
 * POST:
 * action=sendTourCustomerReply
 * reservation_id
 * subject
 * body
 *
 * @param {Object} params
 * @returns {GoogleAppsScript.Content.TextOutput}
 */
function sendTourCustomerReply(
  params
) {

  try {

    params =
      params || {};

    const reservationId =
      String(
        params.reservation_id || ""
      ).trim();

    const subject =
      String(
        params.subject || ""
      ).trim();

    const body =
      String(
        params.body || ""
      ).trim();

    if (!reservationId) {
      return errorResponse(
        "reservation_idを指定してください。",
        "VALIDATION_ERROR"
      );
    }

    if (!subject) {
      return errorResponse(
        "件名を入力してください。",
        "VALIDATION_ERROR"
      );
    }

    if (!body) {
      return errorResponse(
        "本文を入力してください。",
        "VALIDATION_ERROR"
      );
    }

    const reservationInfo =
      findReservationRowById_(
        reservationId
      );

    if (!reservationInfo) {
      return errorResponse(
        "指定された予約が見つかりません。",
        "RESERVATION_NOT_FOUND"
      );
    }

    const reservation =
      reservationInfo.record ||
      {};

    const serviceCode =
      String(
        reservation.service_code || ""
      ).trim().toUpperCase();

    if (
      serviceCode !== "TOUR"
    ) {
      return errorResponse(
        "店内見学予約のみ返信できます。",
        "INVALID_SERVICE"
      );
    }

    const to =
      String(
        reservation.customer_email || ""
      ).trim();

    if (!to) {
      return errorResponse(
        "見学者のメールアドレスが登録されていません。",
        "CUSTOMER_EMAIL_NOT_FOUND"
      );
    }

    /*
     * info@theforestgym.com 以外から誤送信しない。
     *
     * - GAS実行アカウント自体がinfoの場合
     * - Gmailの送信元エイリアスにinfoがある場合
     * のみ許可。
     */
    const effectiveEmail =
      String(
        Session
          .getEffectiveUser()
          .getEmail() || ""
      ).trim().toLowerCase();

    const aliases =
      GmailApp
        .getAliases()
        .map(function(alias) {
          return String(
            alias || ""
          ).trim().toLowerCase();
        });

    const targetFrom =
      TOUR_REPLY_FROM_EMAIL
        .toLowerCase();

    const options = {
      name:
        TOUR_REPLY_FROM_NAME,
      replyTo:
        TOUR_REPLY_FROM_EMAIL
    };

    if (
      effectiveEmail !==
      targetFrom
    ) {

      if (
        !aliases.includes(
          targetFrom
        )
      ) {
        throw new Error(
          "info@theforestgym.com から送信できるGmail設定がありません。GAS実行アカウントまたはGmail送信元エイリアスを確認してください。"
        );
      }

      options.from =
        TOUR_REPLY_FROM_EMAIL;
    }

    GmailApp.sendEmail(
      to,
      subject,
      body,
      options
    );

    // メール返信した時点で問い合わせ対応済みにする。
    try {
      setTourInquiryStatus({
        reservation_id: reservationId,
        inquiry_status: "DONE",
        handler_code: params.handler_code || params.handler_email || "",
        handler_name: params.handler_name || ""
      });
    } catch (ignore) {}

    logInfo(
      "sendTourCustomerReply",
      "店内見学者へ返信メール送信成功",
      {
        reservation_id:
          reservationId,
        to:
          to,
        from:
          TOUR_REPLY_FROM_EMAIL,
        subject:
          subject
      }
    );

    return successResponse({
      reservation_id:
        reservationId,
      to:
        to,
      from:
        TOUR_REPLY_FROM_EMAIL,
      subject:
        subject,
      sent:
        true
    });

  } catch (error) {

    logError(
      "sendTourCustomerReply",
      error.message,
      {
        stack:
          error.stack
      }
    );

    return errorResponse(
      error.message ||
      "メール送信中にエラーが発生しました。",
      "TOUR_REPLY_ERROR"
    );
  }
}
