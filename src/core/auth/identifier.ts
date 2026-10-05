/**
 * Signup identifiers: an account can be created with an email address OR a
 * phone number.
 *
 * Why this file exists rather than a form-only change:
 *
 *  * `user.email` is nullable and `user.phone` is uniquely indexed, so the
 *    database cannot tell us which one a user typed. That decision has to be
 *    made once, here, and used identically by the signup route, the signin
 *    route and the form — otherwise the two drift and a user can register with
 *    a phone and then be unable to log in.
 *  * The country dial code is stored separately from the national number
 *    (`user.countryCode` + `user.phone`) so the two can be corrected
 *    independently, and so `+967 7xx xxx xxx` is not frozen into one string.
 *  * `better-auth` still identifies accounts by email: it has no phone plugin
 *    in this build and no SMS provider is configured, so a phone-only account
 *    is given a deterministic internal address. It is never displayed and must
 *    never be mailed. `isInternalAuthEmail` exists so that can be asserted.
 */

/** A country that can be dialled at signup. */
export interface Country {
  /** ISO 3166-1 alpha-2. */
  code: string;
  /** Arabic display name. */
  nameAr: string;
  /**
   * International dialling prefix without the `+`, e.g. "967".
   *
   * NOT unique, and deliberately so: many countries share a prefix and are
   * told apart by the digits that follow (+1 covers the whole NANP, +7 Russia
   * and Kazakhstan, +44 Guernsey/Jersey/Isle of Man, +212 Morocco and Western
   * Sahara, +262 Réunion and Mayotte, +39 Italy and the Vatican, +61 Australia
   * and its external territories). A unique constraint here would be a lie.
   */
  dial: string;
  /**
   * NANP area/territory code, present only where the country code is "1".
   *
   * `dial` stays the E.164 country calling code so `+${dial}${phone}` is always
   * correct, and `area` is *part of the stored phone number*, not part of the
   * prefix. The area code therefore appears in the picker (to tell Anguila
   * from Aruba) but is never prepended when formatting a number.
   */
  area?: string;
}

/**
 * Every country reachable by dialling code, so a signup form never has to
 * refuse a valid number because its country was not on the list.
 *
 * Source: the ITU-T E.164 assigned country-code list, with Arabic names. Kept as
 * one literal so it can be read and corrected in a single place.
 */
export const COUNTRIES: readonly Country[] = [
  // ── Arab world ──────────────────────────────────────────────────────────
  { code: "YE", nameAr: "اليمن", dial: "967" },
  { code: "SA", nameAr: "السعودية", dial: "966" },
  { code: "AE", nameAr: "الإمارات", dial: "971" },
  { code: "EG", nameAr: "مصر", dial: "20" },
  { code: "KW", nameAr: "الكويت", dial: "965" },
  { code: "QA", nameAr: "قطر", dial: "974" },
  { code: "BH", nameAr: "البحرين", dial: "973" },
  { code: "OM", nameAr: "عُمان", dial: "968" },
  { code: "JO", nameAr: "الأردن", dial: "962" },
  { code: "LB", nameAr: "لبنان", dial: "961" },
  { code: "IQ", nameAr: "العراق", dial: "964" },
  { code: "PS", nameAr: "فلسطين", dial: "970" },
  { code: "SY", nameAr: "سوريا", dial: "963" },
  { code: "MR", nameAr: "موريتانيا", dial: "222" },
  { code: "SO", nameAr: "الصومال", dial: "252" },
  { code: "DJ", nameAr: "جيبوتي", dial: "253" },
  { code: "KM", nameAr: "جزر القمر", dial: "269" },
  { code: "EH", nameAr: "الصحراء الغربية", dial: "212" },
  { code: "MA", nameAr: "المغرب", dial: "212" },
  { code: "DZ", nameAr: "الجزائر", dial: "213" },
  { code: "TN", nameAr: "تونس", dial: "216" },
  { code: "LY", nameAr: "ليبيا", dial: "218" },
  { code: "SD", nameAr: "السودان", dial: "249" },
  { code: "SS", nameAr: "جنوب السودان", dial: "211" },

  // ── Africa ──────────────────────────────────────────────────────────────
  { code: "AC", nameAr: "أسينتشيون", dial: "247" },
  { code: "AO", nameAr: "أنغولا", dial: "244" },
  { code: "BJ", nameAr: "بنين", dial: "229" },
  { code: "BW", nameAr: "بوتسوانا", dial: "267" },
  { code: "BF", nameAr: "بوركينا فاسو", dial: "226" },
  { code: "BI", nameAr: "بوروندي", dial: "257" },
  { code: "CV", nameAr: "الرأس الأخضر", dial: "238" },
  { code: "CM", nameAr: "الكاميرون", dial: "237" },
  { code: "CF", nameAr: "أفريقيا الوسطى", dial: "236" },
  { code: "TD", nameAr: "تشاد", dial: "235" },
  { code: "CG", nameAr: "الكونغو", dial: "242" },
  { code: "CD", nameAr: "الكونغو الديمقراطية", dial: "243" },
  { code: "CI", nameAr: "كوت ديفوار", dial: "225" },
  { code: "GQ", nameAr: "غينيا الاستوائية", dial: "240" },
  { code: "ER", nameAr: "إريتريا", dial: "291" },
  { code: "SZ", nameAr: "إسواتيني", dial: "268" },
  { code: "ET", nameAr: "إثيوبيا", dial: "251" },
  { code: "GA", nameAr: "الغابون", dial: "241" },
  { code: "GM", nameAr: "غامبيا", dial: "220" },
  { code: "GH", nameAr: "غانا", dial: "233" },
  { code: "GN", nameAr: "غينيا", dial: "224" },
  { code: "GW", nameAr: "غينيا بيساو", dial: "245" },
  { code: "KE", nameAr: "كينيا", dial: "254" },
  { code: "LS", nameAr: "ليسوتو", dial: "266" },
  { code: "LR", nameAr: "ليبيريا", dial: "231" },
  { code: "MG", nameAr: "مدغشقر", dial: "261" },
  { code: "MW", nameAr: "ملاوي", dial: "265" },
  { code: "ML", nameAr: "مالي", dial: "223" },
  { code: "MU", nameAr: "موريشيوس", dial: "230" },
  { code: "MZ", nameAr: "موزمبيق", dial: "258" },
  { code: "NA", nameAr: "ناميبيا", dial: "264" },
  { code: "NE", nameAr: "النيجر", dial: "227" },
  { code: "NG", nameAr: "نيجيريا", dial: "234" },
  { code: "RW", nameAr: "رواندا", dial: "250" },
  { code: "ST", nameAr: "ساو تومي وبرينسيبي", dial: "239" },
  { code: "SN", nameAr: "السنغال", dial: "221" },
  { code: "SC", nameAr: "سيشل", dial: "248" },
  { code: "SL", nameAr: "سيراليون", dial: "232" },
  { code: "ZA", nameAr: "جنوب أفريقيا", dial: "27" },
  { code: "TZ", nameAr: "تنزانيا", dial: "255" },
  { code: "TG", nameAr: "توغو", dial: "228" },
  { code: "UG", nameAr: "أوغندا", dial: "256" },
  { code: "ZM", nameAr: "زامبيا", dial: "260" },
  { code: "ZW", nameAr: "زيمبابوي", dial: "263" },
  { code: "RE", nameAr: "ريونيون", dial: "262" },
  { code: "YT", nameAr: "مايوت", dial: "262" },
  { code: "SH", nameAr: "سانت هيلينا", dial: "290" },
  { code: "TA", nameAr: "ترياتنشان دا كونيا", dial: "290" },

  // ── Asia ────────────────────────────────────────────────────────────────
  { code: "AF", nameAr: "أفغانستان", dial: "93" },
  { code: "AM", nameAr: "أرمينيا", dial: "374" },
  { code: "AZ", nameAr: "أذربيجان", dial: "994" },
  { code: "BD", nameAr: "بنغلاديش", dial: "880" },
  { code: "BT", nameAr: "بوتان", dial: "975" },
  { code: "BN", nameAr: "بروناي", dial: "673" },
  { code: "KH", nameAr: "كمبوديا", dial: "855" },
  { code: "CN", nameAr: "الصين", dial: "86" },
  { code: "GE", nameAr: "جورجيا", dial: "995" },
  { code: "IN", nameAr: "الهند", dial: "91" },
  { code: "ID", nameAr: "إندونيسيا", dial: "62" },
  { code: "IR", nameAr: "إيران", dial: "98" },
  { code: "JP", nameAr: "اليابان", dial: "81" },
  { code: "KZ", nameAr: "كازاخستان", dial: "7" },
  { code: "KG", nameAr: "قيرغيزستان", dial: "996" },
  { code: "LA", nameAr: "لاوس", dial: "856" },
  { code: "MO", nameAr: "ماكاو", dial: "853" },
  { code: "MY", nameAr: "ماليزيا", dial: "60" },
  { code: "MV", nameAr: "المالديف", dial: "960" },
  { code: "MN", nameAr: "منغوليا", dial: "976" },
  { code: "MM", nameAr: "ميانمار", dial: "95" },
  { code: "NP", nameAr: "نيبال", dial: "977" },
  { code: "KP", nameAr: "كوريا الشمالية", dial: "850" },
  { code: "KR", nameAr: "كوريا الجنوبية", dial: "82" },
  { code: "PK", nameAr: "باكستان", dial: "92" },
  { code: "PH", nameAr: "الفلبين", dial: "63" },
  { code: "SG", nameAr: "سنغافورة", dial: "65" },
  { code: "LK", nameAr: "سريلانكا", dial: "94" },
  { code: "TW", nameAr: "تايوان", dial: "886" },
  { code: "TJ", nameAr: "طاجيكستان", dial: "992" },
  { code: "TH", nameAr: "تايلاند", dial: "66" },
  { code: "TL", nameAr: "تيمور الشرقية", dial: "670" },
  { code: "TR", nameAr: "تركيا", dial: "90" },
  { code: "TM", nameAr: "تركمانستان", dial: "993" },
  { code: "UZ", nameAr: "أوزبكستان", dial: "998" },
  { code: "VN", nameAr: "فيتنام", dial: "84" },
  { code: "HK", nameAr: "هونغ كونغ", dial: "852" },
  { code: "CX", nameAr: "جزر الكريسماس", dial: "61" },
  { code: "CC", nameAr: "كوكوس", dial: "61" },
  { code: "NF", nameAr: "نورفولك", dial: "672" },

  // ── Europe ──────────────────────────────────────────────────────────────
  { code: "AL", nameAr: "ألبانيا", dial: "355" },
  { code: "AD", nameAr: "أندورا", dial: "376" },
  { code: "AT", nameAr: "النمسا", dial: "43" },
  { code: "BY", nameAr: "بيلاروسا", dial: "375" },
  { code: "BE", nameAr: "بلجيكا", dial: "32" },
  { code: "BA", nameAr: "البوسنة والهرسك", dial: "387" },
  { code: "BG", nameAr: "بلغاريا", dial: "359" },
  { code: "HR", nameAr: "كرواتيا", dial: "385" },
  { code: "CY", nameAr: "قبرص", dial: "357" },
  { code: "CZ", nameAr: "التشيك", dial: "420" },
  { code: "DK", nameAr: "الدنمارك", dial: "45" },
  { code: "EE", nameAr: "إستونيا", dial: "372" },
  { code: "FO", nameAr: "جزر فارو", dial: "298" },
  { code: "FI", nameAr: "فنلندا", dial: "358" },
  { code: "FR", nameAr: "فرنسا", dial: "33" },
  { code: "DE", nameAr: "ألمانيا", dial: "49" },
  { code: "GR", nameAr: "اليونان", dial: "30" },
  { code: "VA", nameAr: "الفاتيكان", dial: "39" },
  { code: "HU", nameAr: "المجر", dial: "36" },
  { code: "IS", nameAr: "آيسلندا", dial: "354" },
  { code: "IE", nameAr: "أيرلندا", dial: "353" },
  { code: "IM", nameAr: "جزيرة مان", dial: "44" },
  { code: "IT", nameAr: "إيطاليا", dial: "39" },
  { code: "JE", nameAr: "جيرزي", dial: "44" },
  { code: "GG", nameAr: "غيرنزي", dial: "44" },
  { code: "LV", nameAr: "لاتفيا", dial: "371" },
  { code: "LI", nameAr: "ليختنشتاين", dial: "41" },
  { code: "LT", nameAr: "ليتوانيا", dial: "370" },
  { code: "LU", nameAr: "لوكسمبورغ", dial: "352" },
  { code: "MT", nameAr: "مالطا", dial: "356" },
  { code: "MD", nameAr: "مولدوفا", dial: "373" },
  { code: "MC", nameAr: "موناكو", dial: "377" },
  { code: "ME", nameAr: "الجبل الأسود", dial: "382" },
  { code: "NL", nameAr: "هولندا", dial: "31" },
  { code: "MK", nameAr: "مقدونيا الشمالية", dial: "389" },
  { code: "NO", nameAr: "النرويج", dial: "47" },
  { code: "PL", nameAr: "بولندا", dial: "48" },
  { code: "PT", nameAr: "البرتغال", dial: "351" },
  { code: "RO", nameAr: "رومانيا", dial: "40" },
  { code: "RU", nameAr: "روسيا", dial: "7" },
  { code: "SM", nameAr: "سان مارينو", dial: "378" },
  { code: "RS", nameAr: "صربيا", dial: "381" },
  { code: "SK", nameAr: "سلوفاكيا", dial: "421" },
  { code: "SI", nameAr: "سلوفينيا", dial: "386" },
  { code: "ES", nameAr: "إسبانيا", dial: "34" },
  { code: "SJ", nameAr: "سفالبارد ويان ماين", dial: "47" },
  { code: "SE", nameAr: "السويد", dial: "46" },
  { code: "CH", nameAr: "سويسرا", dial: "41" },
  { code: "UA", nameAr: "أوكرانيا", dial: "380" },
  { code: "GB", nameAr: "بريطانيا", dial: "44" },
  { code: "AX", nameAr: "أولاند", dial: "358" },
  { code: "XK", nameAr: "كوسوفو", dial: "383" },
  { code: "GI", nameAr: "جبل طارق", dial: "350" },

  // ── North & Central America, Caribbean ──────────────────────────────────
  // NANP entries all share country code +1 and are distinguished by `area`.
  { code: "AI", nameAr: "أنغويلا", dial: "1", area: "264" },
  { code: "AG", nameAr: "أنتيغوا وباربودا", dial: "1", area: "268" },
  { code: "BS", nameAr: "الباهاما", dial: "1", area: "242" },
  { code: "BB", nameAr: "باربادوس", dial: "1", area: "246" },
  { code: "BZ", nameAr: "بليز", dial: "501" },
  { code: "BM", nameAr: "برمودا", dial: "1", area: "441" },
  { code: "VG", nameAr: "جزر العذراء البريطانية", dial: "1", area: "284" },
  { code: "CA", nameAr: "كندا", dial: "1" },
  { code: "KY", nameAr: "جزر كايمان", dial: "1", area: "345" },
  { code: "CR", nameAr: "كوستاريكا", dial: "506" },
  { code: "CU", nameAr: "كوبا", dial: "53" },
  { code: "CW", nameAr: "كوراساو", dial: "599" },
  { code: "DM", nameAr: "دومينيكا", dial: "1", area: "767" },
  { code: "DO", nameAr: "جمهورية الدومينيكان", dial: "1", area: "809" },
  { code: "SV", nameAr: "السلفادور", dial: "503" },
  { code: "GD", nameAr: "غرينادا", dial: "1", area: "473" },
  { code: "GL", nameAr: "غرينلاند", dial: "299" },
  { code: "GP", nameAr: "غوادلوب", dial: "590" },
  { code: "GT", nameAr: "غواتيمالا", dial: "502" },
  { code: "HT", nameAr: "هايتي", dial: "509" },
  { code: "HN", nameAr: "هندوراس", dial: "504" },
  { code: "JM", nameAr: "جامايكا", dial: "1", area: "876" },
  { code: "MQ", nameAr: "مارتينيك", dial: "596" },
  { code: "MX", nameAr: "المكسيك", dial: "52" },
  { code: "MS", nameAr: "مونتسرات", dial: "1", area: "664" },
  { code: "NI", nameAr: "نيكاراغوا", dial: "505" },
  { code: "PA", nameAr: "بنما", dial: "507" },
  { code: "PR", nameAr: "بورتوريكو", dial: "1", area: "787" },
  { code: "BL", nameAr: "سان بارتيلمي", dial: "590" },
  { code: "KN", nameAr: "سانت كيتس ونيفيس", dial: "1", area: "869" },
  { code: "LC", nameAr: "سانت لوسيا", dial: "1", area: "758" },
  { code: "MF", nameAr: "سانت مارتن", dial: "590" },
  { code: "PM", nameAr: "سان بيير وميكلون", dial: "508" },
  { code: "VC", nameAr: "سانت فنسنت", dial: "1", area: "784" },
  { code: "SX", nameAr: "سينت مارتن", dial: "1", area: "721" },
  { code: "TT", nameAr: "ترينيداد وتوباغو", dial: "1", area: "868" },
  { code: "TC", nameAr: "جزر تركس وكايكوس", dial: "1", area: "649" },
  { code: "US", nameAr: "الولايات المتحدة", dial: "1" },
  { code: "VI", nameAr: "جزر العذراء الأمريكية", dial: "1", area: "340" },
  { code: "AW", nameAr: "أروبا", dial: "297" },

  // ── South America ───────────────────────────────────────────────────────
  { code: "AR", nameAr: "الأرجنتين", dial: "54" },
  { code: "BO", nameAr: "بوليفيا", dial: "591" },
  { code: "BR", nameAr: "البرازيل", dial: "55" },
  { code: "CL", nameAr: "تشيلي", dial: "56" },
  { code: "CO", nameAr: "كولومبيا", dial: "57" },
  { code: "EC", nameAr: "الإكوادور", dial: "593" },
  { code: "GY", nameAr: "غيانا", dial: "592" },
  { code: "PY", nameAr: "باراغواي", dial: "595" },
  { code: "PE", nameAr: "بيرو", dial: "51" },
  { code: "SR", nameAr: "سورينام", dial: "597" },
  { code: "UY", nameAr: "أوروغواي", dial: "598" },
  { code: "VE", nameAr: "فنزويلا", dial: "58" },
  { code: "GF", nameAr: "غويانا الفرنسية", dial: "594" },
  { code: "FK", nameAr: "فوكلاند", dial: "500" },

  // ── Oceania ─────────────────────────────────────────────────────────────
  { code: "AU", nameAr: "أستراليا", dial: "61" },
  { code: "CK", nameAr: "كوك", dial: "682" },
  { code: "FJ", nameAr: "فيجي", dial: "679" },
  { code: "PF", nameAr: "بولينيزيا الفرنسية", dial: "689" },
  { code: "KI", nameAr: "كيريباتي", dial: "686" },
  { code: "MH", nameAr: "جزر مارشال", dial: "692" },
  { code: "FM", nameAr: "ميكرونيزيا", dial: "691" },
  { code: "NR", nameAr: "ناورو", dial: "674" },
  { code: "NZ", nameAr: "نيوزيلندا", dial: "64" },
  { code: "NU", nameAr: "نيوي", dial: "683" },
  { code: "PW", nameAr: "بالاو", dial: "680" },
  { code: "PG", nameAr: "بابوا غينيا الجديدة", dial: "675" },
  { code: "PN", nameAr: "بيتكيرن", dial: "64" },
  { code: "WS", nameAr: "ساموا", dial: "685" },
  { code: "SB", nameAr: "جزر سليمان", dial: "677" },
  { code: "TK", nameAr: "توكيلاو", dial: "690" },
  { code: "TO", nameAr: "تونغا", dial: "676" },
  { code: "TV", nameAr: "توفالو", dial: "688" },
  { code: "VU", nameAr: "فانواتو", dial: "678" },
  { code: "WF", nameAr: "واليس وفوتونا", dial: "681" },
  { code: "AS", nameAr: "ساموا الأمريكية", dial: "1", area: "684" },
  { code: "GU", nameAr: "غوام", dial: "1", area: "671" },
  { code: "MP", nameAr: "ماريانا الشمالية", dial: "1", area: "670" },

  // ── Other territories with a dialling code ──────────────────────────────
  { code: "AQ", nameAr: "أنتاركتيكا", dial: "672" },
  { code: "HM", nameAr: "هيرد وماكدونالد", dial: "672" },
  { code: "TF", nameAr: "أراضٍ فرنسية جنوبية", dial: "262" },
  { code: "BV", nameAr: "بوفيه", dial: "47" },
];

/** Countries sorted by Arabic name — the order the picker lists them in. */
export const COUNTRIES_BY_NAME: readonly Country[] = [...COUNTRIES].sort((a, b) =>
  a.nameAr.localeCompare(b.nameAr, "ar"),
);

/**
 * Flag emoji for an ISO 3166-1 alpha-2 code, derived from the two regional
 * indicator code points (U+1F1E6 + letter). No image assets, no icon library,
 * and it degrades to "" if a code is ever malformed.
 *
 * Caveat worth knowing: these render as emoji only where the platform has an
 * emoji font. On a bare Windows/Linux server the flag falls back to the two
 * letters, which is why the dial code is always shown next to it rather than
 * relying on the flag alone to identify the country.
 */
export function flagEmoji(code: string): string {
  const upper = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  return String.fromCodePoint(
    ...[...upper].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - "A".charCodeAt(0)),
  );
}

/**
 * How a country's dialling prefix should be written, e.g. `+967`, `+1 264`.
 *
 * The NANP space is what makes the picker usable: the United States, Canada and
 * 20-odd territories all have `+1`, and without the area code the list would
 * show 23 identical rows.
 */
export function displayDial(country: Country): string {
  return country.area ? `+${country.dial} ${country.area}` : `+${country.dial}`;
}

/**
 * Country search for the picker.
 *
 * Matches the Arabic name, the ISO code and the dialling code, and ignores a
 * leading "+", internal spaces and letter case — so "967", "+967", "YE", "ye" and
 * "يمن" all find Yemen. Dialling codes are searched as written, which means
 * "967" finds Yemen but "1 264" needs to be typed without the space.
 *
 * Exported rather than inlined in the picker so it can be unit-tested; a search
 * box that silently returns nothing is exactly the kind of thing that otherwise
 * only shows up by hand.
 */
export function searchCountries(query: string, list: readonly Country[] = COUNTRIES_BY_NAME): Country[] {
  const raw = query.trim();
  if (!raw) return [...list];
  const bare = raw.replace(/^\+/, "").replace(/\s+/g, "").toLowerCase();
  return list.filter(
    (c) =>
      c.nameAr.includes(raw) ||
      c.code.toLowerCase().includes(bare) ||
      displayDial(c).replace(/[+\s]/g, "").toLowerCase().includes(bare),
  );
}
export const DEFAULT_COUNTRY = "YE";

export function findCountry(code: string | null | undefined): Country | null {
  if (!code) return null;
  const upper = code.toUpperCase();
  return COUNTRIES.find((c) => c.code === upper) ?? null;
}

/** How a signup identifier was recognised. */
export type IdentifierKind = "email" | "phone";

export interface ResolvedIdentifier {
  kind: IdentifierKind;
  /** Lowercased, trimmed email. Null when `kind` is "phone". */
  email: string | null;
  /** Digits only, no dial code and no `+`. Null when `kind` is "email". */
  phone: string | null;
  /** ISO code of the selected country. Only set when `kind` is "phone". */
  countryCode: string | null;
}

/**
 * Classifies a raw identifier. A value containing `@` is treated as an email;
 * anything else is a phone number. Digits, spaces, dashes, dots and brackets
 * are stripped from phone input so `+967 7 777 777 777` and `0777777777`
 * normalise the same way.
 */
export function resolveIdentifier(
  raw: string,
  countryCode?: string | null,
): ResolvedIdentifier | { error: "empty" | "invalid" } {
  const value = (raw ?? "").trim();
  if (!value) return { error: "empty" };

  if (value.includes("@")) {
    const email = value.toLowerCase();
    // Deliberately permissive: the same shape zod's `.email()` accepts, kept
    // local so this module has no dependency.
    if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)) return { error: "invalid" };
    return { kind: "email", email, phone: null, countryCode: null };
  }

  const country = findCountry(countryCode);
  if (!country) return { error: "invalid" };

  // Keep a leading dial code out of the national number: if the user typed the
  // country prefix themselves (`+967…` or `967…`), strip it.
  let digits = value.replace(/[^\d]/g, "");
  if (digits.startsWith(country.dial)) digits = digits.slice(country.dial.length);

  if (digits.length < 6) return { error: "invalid" };
  // Yemeni local numbers are often typed with a leading 0 (07…); drop it.
  if (digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length < 6) return { error: "invalid" };

  return { kind: "phone", email: null, phone: digits, countryCode: country.code };
}

/** Full international form for display, e.g. `+967777777777`. */
export function formatInternational(phone: string | null, countryCode: string | null): string | null {
  if (!phone) return null;
  const country = findCountry(countryCode);
  return country ? `+${country.dial}${phone}` : `+${phone}`;
}

/** The stand-in email better-auth requires for a phone-only account. */
export function internalAuthEmail(phone: string, countryCode: string | null): string {
  const country = findCountry(countryCode);
  const key = country ? `${country.dial}${phone}` : phone;
  return `p${key}@phone.bos.local`;
}

const INTERNAL_AUTH_DOMAIN = "@phone.bos.local";

/** True for an address generated by `internalAuthEmail` — never show or mail these. */
export function isInternalAuthEmail(email: string | null | undefined): boolean {
  return typeof email === "string" && email.endsWith(INTERNAL_AUTH_DOMAIN);
}

/** The address a human should see for a user row. */
export function displayIdentifier(user: { email: string | null; phone: string | null; countryCode: string | null }): string {
  const phone = formatInternational(user.phone, user.countryCode);
  if (user.email && !isInternalAuthEmail(user.email)) return user.email;
  return phone ?? "";
}
