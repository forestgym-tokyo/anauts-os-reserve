/**
 * 会員向け予約管理ページ
 *
 * 予約完了メール等に記載する署名付きURLから、
 * 予約内容の確認・変更・キャンセルを行う。
 *
 * URL:
 * ?page=reservation&rid=...&token=...
 */


/**
 * 会員向け予約管理ページを表示
 *
 * @param {Object} params
 * @returns {GoogleAppsScript.HTML.HtmlOutput}
 */
function renderReservationManagePage_(params) {

  params = params || {};

  const reservationId =
    normalizeReservationText_(
      params.rid
    );

  const token =
    normalizeReservationText_(
      params.token
    );

  if (
    !reservationId ||
    !verifyReservationManageToken_(
      reservationId,
      token
    )
  ) {

    return HtmlService
      .createHtmlOutput(
        '<!doctype html><html><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>予約管理</title></head>' +
        '<body style="font-family:sans-serif;padding:32px;line-height:1.7">' +
        '<h2>このURLはご利用いただけません</h2>' +
        '<p>URLが正しくないか、予約情報を確認できませんでした。</p>' +
        '</body></html>'
      )
      .setTitle(
        "予約管理"
      );
  }

  const template =
    HtmlService.createTemplateFromFile(
      "ReservationManage"
    );

  template.reservationId =
    reservationId;

  template.token =
    token;

  template.manageMode =
    "CUSTOMER";

  return template
    .evaluate()
    .setTitle(
      "予約内容の確認・変更・キャンセル"
    )
    .addMetaTag(
      "viewport",
      "width=device-width, initial-scale=1"
    );
}



/**
 * 管理者向け予約管理ページ
 */
function renderAdminReservationManagePage_(params) {
  params = params || {};

  const reservationId =
    normalizeReservationText_(params.rid);

  const token =
    normalizeReservationText_(params.token);

  if (
    !reservationId ||
    !verifyAdminReservationManageToken_(
      reservationId,
      token
    )
  ) {
    return HtmlService
      .createHtmlOutput(
        '<!doctype html><html><head><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width,initial-scale=1">' +
        '<title>管理者用予約管理</title></head>' +
        '<body style="font-family:sans-serif;padding:32px;line-height:1.7">' +
        '<h2>このURLはご利用いただけません</h2>' +
        '<p>管理者用URLが正しくないか、予約情報を確認できませんでした。</p>' +
        '</body></html>'
      )
      .setTitle("管理者用予約管理");
  }

  const template =
    HtmlService.createTemplateFromFile(
      "ReservationManage"
    );

  template.reservationId =
    reservationId;

  template.token =
    token;

  template.manageMode =
    "ADMIN";

  return template
    .evaluate()
    .setTitle(
      "管理者用｜予約内容の確認・変更・キャンセル"
    )
    .addMetaTag(
      "viewport",
      "width=device-width, initial-scale=1"
    );
}


/**
 * スタッフ画面用：管理者予約管理URL取得
 *
 * 認証自体は99_Main.gs側で行う。
 */
function getAdminReservationManageUrl(
  params
) {
  params = params || {};

  const reservationId =
    normalizeReservationText_(
      params.reservation_id
    );

  if (!reservationId) {
    return errorResponse(
      "reservation_idを指定してください。",
      "RESERVATION_ID_REQUIRED"
    );
  }

  const reservationInfo =
    findReservationRowById_(
      reservationId
    );

  if (!reservationInfo) {
    return errorResponse(
      "予約が見つかりません。",
      "RESERVATION_NOT_FOUND",
      {
        reservation_id:
          reservationId
      }
    );
  }

  const url =
    buildAdminReservationManageUrl_(
      reservationId
    );

  if (!url) {
    return errorResponse(
      "予約管理URLを生成できませんでした。",
      "ADMIN_MANAGE_URL_ERROR"
    );
  }

  return successResponse({
    reservation_id:
      reservationId,

    manage_url:
      url
  });
}


/**
 * 管理者用予約管理URL生成
 */
function buildAdminReservationManageUrl_(
  reservationId
) {
  const normalizedId =
    normalizeReservationText_(
      reservationId
    );

  if (!normalizedId) {
    return "";
  }

  const serviceUrl =
    ScriptApp
      .getService()
      .getUrl();

  if (!serviceUrl) {
    return "";
  }

  const token =
    createAdminReservationManageToken_(
      normalizedId
    );

  return (
    serviceUrl +
    "?page=reservation-admin" +
    "&rid=" +
    encodeURIComponent(normalizedId) +
    "&token=" +
    encodeURIComponent(token)
  );
}


function createAdminReservationManageToken_(
  reservationId
) {
  const secret =
    getReservationManageSecret_();

  const bytes =
    Utilities.computeHmacSha256Signature(
      "ADMIN|" + reservationId,
      secret
    );

  return Utilities
    .base64EncodeWebSafe(bytes)
    .replace(/=+$/g, "");
}


function verifyAdminReservationManageToken_(
  reservationId,
  token
) {
  const normalizedId =
    normalizeReservationText_(
      reservationId
    );

  const normalizedToken =
    normalizeReservationText_(
      token
    );

  if (
    !normalizedId ||
    !normalizedToken
  ) {
    return false;
  }

  const expected =
    createAdminReservationManageToken_(
      normalizedId
    );

  if (
    expected.length !==
    normalizedToken.length
  ) {
    return false;
  }

  let diff = 0;

  for (
    let i = 0;
    i < expected.length;
    i++
  ) {
    diff |=
      expected.charCodeAt(i) ^
      normalizedToken.charCodeAt(i);
  }

  return diff === 0;
}


/**
 * 予約管理URL生成
 *
 * @param {string} reservationId
 * @returns {string}
 */
function buildReservationManageUrl_(
  reservationId
) {

  const normalizedId =
    normalizeReservationText_(
      reservationId
    );

  if (!normalizedId) {
    return "";
  }

  const serviceUrl =
    ScriptApp
      .getService()
      .getUrl();

  if (!serviceUrl) {
    return "";
  }

  const token =
    createReservationManageToken_(
      normalizedId
    );

  return (
    serviceUrl +
    "?page=reservation" +
    "&rid=" +
    encodeURIComponent(
      normalizedId
    ) +
    "&token=" +
    encodeURIComponent(
      token
    )
  );
}


/**
 * 署名トークン生成
 *
 * @param {string} reservationId
 * @returns {string}
 */
function createReservationManageToken_(
  reservationId
) {

  const secret =
    getReservationManageSecret_();

  const bytes =
    Utilities.computeHmacSha256Signature(
      reservationId,
      secret
    );

  return Utilities
    .base64EncodeWebSafe(
      bytes
    )
    .replace(
      /=+$/g,
      ""
    );
}


/**
 * 署名トークン検証
 *
 * @param {string} reservationId
 * @param {string} token
 * @returns {boolean}
 */
function verifyReservationManageToken_(
  reservationId,
  token
) {

  const normalizedId =
    normalizeReservationText_(
      reservationId
    );

  const normalizedToken =
    normalizeReservationText_(
      token
    );

  if (
    !normalizedId ||
    !normalizedToken
  ) {
    return false;
  }

  const expected =
    createReservationManageToken_(
      normalizedId
    );

  /*
   * 長さを揃えてから差分を集計し、
   * 単純比較よりタイミング差を小さくする。
   */
  if (
    expected.length !==
    normalizedToken.length
  ) {
    return false;
  }

  let diff = 0;

  for (
    let i = 0;
    i < expected.length;
    i++
  ) {

    diff |=
      expected.charCodeAt(i) ^
      normalizedToken.charCodeAt(i);
  }

  return diff === 0;
}


/**
 * URL署名用秘密鍵
 *
 * 初回のみ自動生成し、
 * Script Propertiesへ保存する。
 *
 * @returns {string}
 */
function getReservationManageSecret_() {

  const properties =
    PropertiesService
      .getScriptProperties();

  const key =
    "RESERVATION_MANAGE_SECRET";

  let secret =
    properties.getProperty(
      key
    );

  if (!secret) {

    secret =
      Utilities.getUuid() +
      Utilities.getUuid() +
      Utilities.getUuid();

    properties.setProperty(
      key,
      secret
    );
  }

  return secret;
}


/**
 * 会員向け予約管理情報取得
 *
 * @param {string} reservationId
 * @param {string} token
 * @returns {Object}
 */
function getReservationManageData(
  reservationId,
  token
) {

  assertReservationManageToken_(
    reservationId,
    token
  );

  const reservationInfo =
    findReservationRowById_(
      reservationId
    );

  if (!reservationInfo) {
    throw new Error(
      "予約が見つかりません。"
    );
  }

  const reservation =
    reservationInfo.record;

  const serviceCode =
    normalizeReservationText_(
      reservation.service_code
    );

  const service =
    getAvailabilityService_(
      serviceCode
    );

  const date =
    normalizeReservationDateValue_(
      reservation.reservation_date
    );

  const startTime =
    normalizeReservationSheetTime_(
      reservation.start_time
    );

  const endTime =
    normalizeReservationSheetTime_(
      reservation.end_time
    );

  const startAt =
    createAvailabilityDateTime_(
      date,
      startTime
    );

  const changeLimitHours =
    getReservationRuleNumber_(
      service.change_limit_hours,
      0
    );

  const cancelLimitHours =
    getReservationRuleNumber_(
      service.cancel_limit_hours,
      0
    );

  const changeDeadline =
    new Date(
      startAt.getTime() -
      changeLimitHours *
        60 *
        60 *
        1000
    );

  const cancelDeadline =
    new Date(
      startAt.getTime() -
      cancelLimitHours *
        60 *
        60 *
        1000
    );

  const now =
    new Date();

  const status =
    normalizeReservationText_(
      reservation.status
    ).toUpperCase();

  const isActive =
    (
      status === "RESERVED" ||
      status === "CONFIRMED"
    );

  const beforeStart =
    now.getTime() <
    startAt.getTime();

  const canChange =
    isActive &&
    beforeStart &&
    now.getTime() <
      changeDeadline.getTime();

  const canCancel =
    isActive &&
    beforeStart;

  const cancelDeadlinePassed =
    isActive &&
    beforeStart &&
    now.getTime() >=
      cancelDeadline.getTime();

  return {
    reservation_id:
      reservationId,

    status:
      status,

    service_code:
      serviceCode,

    service_name:
      normalizeReservationText_(
        reservation.service_name ||
        service.service_name ||
        service.name
      ),

    date:
      date,

    start_time:
      startTime,

    end_time:
      endTime,

    staff_code:
      normalizeReservationText_(
        reservation.staff_code
      ),

    staff_name:
      normalizeReservationText_(
        reservation.staff_name
      ),

    change_limit_hours:
      changeLimitHours,

    cancel_limit_hours:
      cancelLimitHours,

    change_deadline:
      formatDateTime_(
        changeDeadline
      ),

    cancel_deadline:
      formatDateTime_(
        cancelDeadline
      ),

    can_change:
      canChange,

    can_cancel:
      canCancel,

    cancel_deadline_passed:
      cancelDeadlinePassed,

    is_personal:
      normalizeReservationText_(
        reservation.calendar_code ||
        service.calendar_code
      ).toUpperCase() ===
        "PERSONAL"
  };
}


/**
 * 変更候補の空き枠取得
 *
 * @param {string} reservationId
 * @param {string} token
 * @param {string} date
 * @returns {Object}
 */
function getReservationManageSlots(
  reservationId,
  token,
  date
) {

  assertReservationManageToken_(
    reservationId,
    token
  );

  const reservationInfo =
    findReservationRowById_(
      reservationId
    );

  if (!reservationInfo) {
    throw new Error(
      "予約が見つかりません。"
    );
  }

  const reservation =
    reservationInfo.record;

  const serviceCode =
    normalizeReservationText_(
      reservation.service_code
    );

  const service =
    getAvailabilityService_(
      serviceCode
    );

  const targetDate =
    normalizeReservationText_(
      date
    );

  const isPersonal =
    normalizeReservationText_(
      reservation.calendar_code ||
      service.calendar_code
    ).toUpperCase() ===
      "PERSONAL";

  /*
   * 一般サービス：
   * 元担当者に固定せず、その日時に対応可能なスタッフ全体から空き枠を返す。
   */
  if (!isPersonal) {
    const response =
      getAvailableSlots({
        action:
          "getAvailableSlots",

        service_code:
          serviceCode,

        date:
          targetDate
      });

    return JSON.parse(
      response.getContent()
    );
  }

  /*
   * パーソナル：
   * 全トレーナーの空き枠を集約する。
   * 同じ時間に複数トレーナーが対応可能な場合は
   * trainer_candidates へ候補を付けて返す。
   */
  const storeCode =
    normalizeReservationText_(
      reservation.store_code ||
      service.store_code ||
      "YACHIYO"
    );

  const trainerResponse =
    getPublicTrainers({
      action:
        "getPublicTrainers",

      store_code:
        storeCode
    });

  const trainerResult =
    JSON.parse(
      trainerResponse.getContent()
    );

  if (
    !trainerResult.ok ||
    !trainerResult.data ||
    !Array.isArray(
      trainerResult.data.trainers
    )
  ) {
    return trainerResult;
  }

  const trainers =
    trainerResult.data.trainers;

  const slotMap =
    {};

  trainers.forEach(
    function(trainer) {

      const staffCode =
        normalizeReservationText_(
          trainer.staff_code
        );

      if (!staffCode) {
        return;
      }

      const response =
        getAvailableSlots({
          action:
            "getAvailableSlots",

          service_code:
            serviceCode,

          date:
            targetDate,

          staff_code:
            staffCode
        });

      const result =
        JSON.parse(
          response.getContent()
        );

      if (
        !result.ok ||
        !result.data ||
        !Array.isArray(
          result.data.slots
        )
      ) {
        return;
      }

      result.data.slots.forEach(
        function(slot) {

          const startTime =
            normalizeReservationText_(
              slot.start_time
            );

          const endTime =
            normalizeReservationText_(
              slot.end_time
            );

          if (!startTime) {
            return;
          }

          const key =
            startTime + "|" + endTime;

          if (!slotMap[key]) {
            slotMap[key] = {
              start_time:
                startTime,

              end_time:
                endTime,

              trainer_candidates:
                []
            };
          }

          const item =
            slotMap[key];

          const alreadyExists =
            item.trainer_candidates.some(
              function(candidate) {
                return (
                  normalizeReservationText_(
                    candidate.staff_code
                  ) ===
                  staffCode
                );
              }
            );

          if (!alreadyExists) {
            item.trainer_candidates.push({
              staff_code:
                staffCode,

              staff_name:
                normalizeReservationText_(
                  trainer.staff_name ||
                  trainer.display_name ||
                  trainer.name ||
                  staffCode
                ),

              display_name:
                normalizeReservationText_(
                  trainer.display_name ||
                  trainer.staff_name ||
                  trainer.name ||
                  staffCode
                )
            });
          }
        }
      );
    }
  );

  const slots =
    Object.keys(
      slotMap
    )
      .map(
        function(key) {
          return slotMap[key];
        }
      )
      .sort(
        function(a, b) {
          return String(
            a.start_time
          ).localeCompare(
            String(
              b.start_time
            )
          );
        }
      );

  return {
    ok: true,
    message:
      slots.length
        ? ""
        : "選択した日に予約可能な時間はありません。",
    data: {
      date:
        targetDate,
      is_personal:
        true,
      slots:
        slots
    }
  };
}


/**
 * 会員向け予約変更
 *
 * @param {Object} params
 * @returns {Object}
 */
function updateReservationFromManagePage(
  params
) {

  params = params || {};

  const reservationId =
    normalizeReservationText_(
      params.reservation_id
    );

  assertReservationManageToken_(
    reservationId,
    params.token
  );

  const current =
    getReservationManageData(
      reservationId,
      params.token
    );

  if (!current.can_change) {
    throw new Error(
      "予約変更受付期限を過ぎているため、変更できません。"
    );
  }

  if (
    current.is_personal &&
    !normalizeReservationText_(
      params.staff_code
    )
  ) {
    throw new Error(
      "担当トレーナーを選択してください。"
    );
  }

  const response =
    updateReservation({
      action:
        "updateReservation",

      reservation_id:
        reservationId,

      date:
        params.date,

      start_time:
        params.start_time,

      /*
       * パーソナルは変更先日時で選択されたトレーナーを使用する。
       * 一般サービスは空文字にして、変更先で対応可能者を再割当する。
       */
      staff_code:
        current.is_personal
          ? normalizeReservationText_(
              params.staff_code
            )
          : ""
    });

  return JSON.parse(
    response.getContent()
  );
}


/**
 * 会員向け予約キャンセル
 *
 * @param {Object} params
 * @returns {Object}
 */
function cancelReservationFromManagePage(
  params
) {

  params = params || {};

  const reservationId =
    normalizeReservationText_(
      params.reservation_id
    );

  assertReservationManageToken_(
    reservationId,
    params.token
  );

  const current =
    getReservationManageData(
      reservationId,
      params.token
    );

  if (!current.can_cancel) {
    throw new Error(
      "この予約はオンラインではキャンセルできません。"
    );
  }

  const response =
    cancelReservation({
      action:
        "cancelReservation",

      reservation_id:
        reservationId,

      cancel_reason:
        "会員予約管理ページからキャンセル",

      cancelled_by:
        "CUSTOMER"
    });

  return JSON.parse(
    response.getContent()
  );
}



/**
 * 管理者用予約管理情報
 * 顧客側の変更・キャンセル期限とは分離する。
 */
function getAdminReservationManageData(
  reservationId,
  token
) {
  assertAdminReservationManageToken_(
    reservationId,
    token
  );

  const reservationInfo =
    findReservationRowById_(
      reservationId
    );

  if (!reservationInfo) {
    throw new Error(
      "予約が見つかりません。"
    );
  }

  const reservation =
    reservationInfo.record;

  const customerData =
    getReservationManageData(
      reservationId,
      createReservationManageToken_(
        reservationId
      )
    );

  const status =
    normalizeReservationText_(
      reservation.status
    ).toUpperCase();

  const isActive =
    status === "RESERVED" ||
    status === "CONFIRMED";

  customerData.can_change =
    isActive;

  customerData.can_cancel =
    isActive;

  customerData.admin_mode =
    true;

  return customerData;
}


function getAdminReservationManageSlots(
  reservationId,
  token,
  date
) {
  assertAdminReservationManageToken_(
    reservationId,
    token
  );

  return getReservationManageSlots(
    reservationId,
    createReservationManageToken_(
      reservationId
    ),
    date
  );
}


/**
 * 管理者用予約変更
 *
 * updateReservationが後段通知等でエラーを返しても、
 * 実データが指定日時へ変更済みなら成功として返す。
 */
function updateReservationFromAdminManagePage(
  params
) {
  params = params || {};

  const reservationId =
    normalizeReservationText_(
      params.reservation_id
    );

  assertAdminReservationManageToken_(
    reservationId,
    params.token
  );

  const current =
    getAdminReservationManageData(
      reservationId,
      params.token
    );

  if (!current.can_change) {
    throw new Error(
      "この予約は変更できる状態ではありません。"
    );
  }

  if (
    current.is_personal &&
    !normalizeReservationText_(
      params.staff_code
    )
  ) {
    throw new Error(
      "担当トレーナーを選択してください。"
    );
  }

  const requestedDate =
    normalizeReservationText_(
      params.date
    );

  const requestedStart =
    normalizeReservationText_(
      params.start_time
    );

  const response =
    updateReservation({
      action:
        "updateReservation",

      reservation_id:
        reservationId,

      date:
        requestedDate,

      start_time:
        requestedStart,

      staff_code:
        current.is_personal
          ? normalizeReservationText_(
              params.staff_code
            )
          : "",

      /*
       * 管理者用署名付きページからの変更。
       * 顧客向けの変更期限・最短予約時間制限は適用しないが、
       * 空き枠・シフト・担当可能roleの判定はupdateReservation側で継続する。
       */
      internal_operation:
        true,

      admin_manage_token:
        params.token,

      updated_by:
        "ADMIN"
    });

  const result =
    JSON.parse(
      response.getContent()
    );

  if (result.ok) {
    return result;
  }

  /*
   * 変更本体成功後のメール等でエラーになった場合を救済。
   */
  const after =
    findReservationRowById_(
      reservationId
    );

  if (after) {
    const actualDate =
      normalizeReservationDateValue_(
        after.record.reservation_date
      );

    const actualStart =
      normalizeReservationSheetTime_(
        after.record.start_time
      );

    if (
      actualDate === requestedDate &&
      actualStart === requestedStart
    ) {
      return {
        ok: true,
        message:
          "予約変更は完了しました。通知処理の一部でエラーが発生しました。",
        data: {
          reservation_id:
            reservationId,
          status:
            normalizeReservationText_(
              after.record.status
            ),
          date:
            actualDate,
          start_time:
            actualStart,
          end_time:
            normalizeReservationSheetTime_(
              after.record.end_time
            ),
          warning:
            result.message || ""
        }
      };
    }
  }

  return result;
}


/**
 * 管理者用キャンセル
 * 顧客用期限ではなくADMINキャンセルとして処理する。
 */
function cancelReservationFromAdminManagePage(
  params
) {
  params = params || {};

  const reservationId =
    normalizeReservationText_(
      params.reservation_id
    );

  assertAdminReservationManageToken_(
    reservationId,
    params.token
  );

  const current =
    getAdminReservationManageData(
      reservationId,
      params.token
    );

  if (!current.can_cancel) {
    throw new Error(
      "この予約はキャンセルできる状態ではありません。"
    );
  }

  const response =
    cancelReservation({
      action:
        "cancelReservation",

      reservation_id:
        reservationId,

      cancel_reason:
        normalizeReservationText_(
          params.cancel_reason
        ) ||
        "管理通知メールからキャンセル",

      cancelled_by:
        "ADMIN"
    });

  const result =
    JSON.parse(
      response.getContent()
    );

  if (result.ok) {
    return result;
  }

  /*
   * 本体キャンセル後の通知処理等でエラーになった場合を救済。
   */
  const after =
    findReservationRowById_(
      reservationId
    );

  if (
    after &&
    normalizeReservationText_(
      after.record.status
    ).toUpperCase() ===
      "CANCELLED"
  ) {
    return {
      ok: true,
      message:
        "予約キャンセルは完了しました。通知処理の一部でエラーが発生しました。",
      data: {
        reservation_id:
          reservationId,
        status:
          "CANCELLED",
        warning:
          result.message || ""
      }
    };
  }

  return result;
}


function assertAdminReservationManageToken_(
  reservationId,
  token
) {
  if (
    !verifyAdminReservationManageToken_(
      reservationId,
      token
    )
  ) {
    throw new Error(
      "管理者用予約管理URLを確認できません。"
    );
  }
}


/**
 * トークン不正時は例外
 */
function assertReservationManageToken_(
  reservationId,
  token
) {

  if (
    !verifyReservationManageToken_(
      reservationId,
      token
    )
  ) {

    throw new Error(
      "予約管理URLを確認できません。"
    );
  }
}


/**
 * 予約管理URLテスト
 *
 * 既存の予約IDへ差し替えて実行可能。
 */
function testReservationManageUrl() {

  const reservationId =
    "RSV20260814160434460230681";

  const url =
    buildReservationManageUrl_(
      reservationId
    );

  Logger.log(
    url
  );

  const token =
    createReservationManageToken_(
      reservationId
    );

  const data =
    getReservationManageData(
      reservationId,
      token
    );

  Logger.log(
    JSON.stringify(
      data
    )
  );
}
