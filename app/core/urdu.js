// Urdu script to the Roman Urdu / English words that the intent rules and the complaint classifier understand.
// A person may type in Urdu, or speak in Urdu (the browser's speech recognition returns Urdu script), and both
// need the same deterministic handling as "pani nahi aa raha". The original words are kept for the complaint
// itself; this conversion is only used to understand it.

const PHRASES = {
  // Problems
  'پانی نہیں آ رہا': 'pani nahi aa raha no water', 'پانی نہیں آرہا': 'pani nahi aa raha no water', 'پانی نہیں آ رہی': 'pani nahi aa raha no water', 'پانی نہیں ہے': 'pani nahi aa raha no water',
  'بجلی نہیں آ رہی': 'bijli nahi aa raha no electricity', 'بجلی نہیں آرہی': 'bijli nahi aa raha no electricity', 'بجلی نہیں ہے': 'bijli nahi aa raha no electricity', 'بجلی بند ہے': 'bijli band hai no electricity',
  'کام نہیں کر رہا': 'not working', 'کام نہیں کر رہی': 'not working', 'کام نہیں کررہا': 'not working', 'کام نہیں کررہی': 'not working', 'نہیں چل رہا': 'nahi chal not working', 'نہیں چل رہی': 'nahi chal not working', 'نہیں جل رہی': 'not working', 'نہیں جل رہا': 'not working',
  'گیس کی بو': 'gas ki boo gas smell', 'گیس لیک': 'gas leak', 'شارٹ سرکٹ': 'short circuit', 'ننگی تار': 'open wire', 'کرنٹ لگ': 'current lag', 'مین ہول کھلا': 'open manhole', 'کھلا مین ہول': 'open manhole',
  'لیک ہو رہا': 'leaking', 'لیک ہو رہی': 'leaking', 'لیک کر رہا': 'leak kar raha', 'لیک کر رہی': 'leak kar raha', 'ٹپک رہا': 'leaking', 'ٹپک رہی': 'leaking', 'بند ہو گیا': 'blocked', 'بند ہوگیا': 'blocked', 'بند ہو گئی': 'blocked', 'بند ہے': 'band hai blocked',
  'ابل رہا': 'overflowing', 'ابل رہی': 'overflowing', 'خراب ہے': 'kharab broken not working', 'خراب ہو گیا': 'kharab broken', 'خراب ہو گئی': 'kharab broken', 'ٹوٹ گیا': 'broken', 'ٹوٹ گئی': 'broken', 'ٹوٹا ہوا': 'broken', 'ٹوٹی ہوئی': 'broken',
  // Things in the street and the house
  'سٹریٹ لائٹ': 'street light', 'اسٹریٹ لائٹ': 'street light', 'گلی کی بتی': 'street light', 'گلی کی لائٹ': 'street light', 'پانی کا ٹینکر': 'water tanker bowzer', 'پانی کی ٹینکی': 'water tank',
  'باورچی خانہ': 'kitchen', 'باورچی خانے': 'kitchen', 'غسل خانہ': 'washroom', 'غسل خانے': 'washroom', 'باتھ روم': 'bathroom', 'واش روم': 'washroom',
  'کچرا نہیں اٹھایا': 'garbage not collected', 'کوڑا نہیں اٹھایا': 'garbage not collected', 'مین ہول': 'manhole',
  // Requests
  'چاہیئے': 'chahiye', 'چاہئے': 'chahiye', 'بھیج دیں': 'bhej do', 'بھیج دو': 'bhej do', 'بھجوا دیں': 'bhijwa do',
  // Money and applications
  'این ڈی سی': 'ndc', 'این او سی': 'noc', 'الاٹمنٹ لیٹر': 'allotment letter', 'ای ٹیگ': 'e-tag', 'نام پر': 'transfer', 'کے نام': 'transfer',
  'سائٹ پلان': 'site plan', 'بلڈنگ پلان': 'building plan', 'ادا کرنا': 'pay', 'ادا کرنی': 'pay', 'ادا کریں': 'pay', 'ادائیگی کرنی': 'pay', 'ادا کر': 'pay',
  // Time
  'صبح سے': 'subah se', 'کل سے': 'kal se', 'رات سے': 'raat se', 'کسی بھی وقت': 'kisi bhi waqt', 'ابھی ابھی': 'abhi abhi', 'کیا حال': 'kya haal',
  'ہو رہی': 'ho rahi', 'ہو رہا': 'ho raha', 'آ رہی': 'aa rahi', 'آ رہا': 'aa raha', 'آرہا': 'aa raha', 'آرہی': 'aa rahi',
};

const WORDS = {
  پانی: 'pani water', بجلی: 'bijli electricity', گیس: 'gas', بو: 'boo', آگ: 'aag fire', دھواں: 'dhuan smoke', چنگاری: 'spark', چنگاریاں: 'sparks', کرنٹ: 'current',
  نل: 'tap', ٹونٹی: 'tap', فلش: 'flush', پائپ: 'pipe', لیک: 'leak', پلمبر: 'plumber', الیکٹریشن: 'electrician', بڑھئی: 'carpenter', ترکھان: 'carpenter', گیزر: 'geyser', پنکھا: 'fan', پنکھے: 'fan',
  سوئچ: 'switch', تار: 'wire', تاریں: 'wires', بلب: 'light', لائٹ: 'light', بتی: 'light', میٹر: 'meter', ٹرانسفارمر: 'transformer', وولٹیج: 'voltage',
  ٹینکر: 'tanker bowzer', باؤزر: 'bowzer', بوزر: 'bowzer', ٹینکی: 'tank', کوڑا: 'garbage', کچرا: 'garbage kachra', کوڑے: 'garbage', صفائی: 'cleaning cleanliness', نالی: 'drain nali', نالا: 'nullah', گٹر: 'gutter sewer', سیوریج: 'sewerage',
  درخت: 'tree', گھاس: 'grass', جھاڑیاں: 'bushes', کتے: 'dogs stray', کتا: 'dog stray', بلی: 'cat', سڑک: 'road sarak', گڑھا: 'pothole', گڑھے: 'pothole', مچھر: 'mosquito machhar', ڈینگی: 'dengue', سپرے: 'spray', اسپرے: 'spray', چوری: 'chori theft', شور: 'noise',
  گلی: 'gali street', گھر: 'ghar house', کچن: 'kitchen', کمرے: 'room', کمرہ: 'room', باہر: 'bahar outside', اندر: 'andar inside', پڑوسی: 'neighbours', پڑوسیوں: 'neighbours',
  بل: 'bill', بلز: 'bills', قسط: 'qist', قسطیں: 'qist', قسطوں: 'qist', بقایا: 'baqaya', بقایاجات: 'baqaya', واجبات: 'dues', ادائیگی: 'payment', ادا: 'pay', رقم: 'amount', ووچر: 'voucher', چالان: 'challan', فیس: 'fee', قیمت: 'price', ریٹ: 'rate',
  کاغذات: 'documents', دستاویزات: 'documents', کاغذ: 'documents', منتقل: 'transfer', بیٹے: 'son', بیٹی: 'daughter', ہبہ: 'gift', فارم: 'form', پاس: 'pass', ڈرائیور: 'driver', ملازم: 'servant', کرایہ: 'rent', کرائے: 'rent', نمبر: 'number', فون: 'phone',
  شکایت: 'shikayat complaint', شکایات: 'shikayat complaints', شکایتیں: 'shikayat complaints', شکایتوں: 'shikayat complaints', درخواست: 'application', نقشہ: 'naqsha', نقشے: 'naqsha', پلاٹ: 'plot', مکان: 'house', مرلہ: 'marla', مرلے: 'marla', کنال: 'kanal', فیز: 'phase', سیکٹر: 'sector', ٹرانسفر: 'transfer', منتقلی: 'transfer',
  میرا: 'mera', میری: 'meri', میرے: 'mere', مجھے: 'mujhe', ہمارا: 'hamara', ہماری: 'hamari', اپنا: 'apna', اپنی: 'apni',
  کتنا: 'kitna', کتنی: 'kitni', کتنے: 'kitne', کیسے: 'kaise', کب: 'kab', کہاں: 'kahan', کیوں: 'kyun', کیا: 'kya', ہے: 'hai', ہیں: 'hain',
  نہیں: 'nahi', خراب: 'kharab broken', بند: 'band', لیکیج: 'leakage', ٹوٹا: 'broken', ٹوٹی: 'broken', غلط: 'galat wrong',
  چاہیے: 'chahiye', چاہئیے: 'chahiye', بھیجیں: 'bhejain', بھیجو: 'bhejo', بلائیں: 'bulain',
  صبح: 'subah morning', شام: 'shaam evening', دوپہر: 'dopahar afternoon', رات: 'raat night', کل: 'kal', آج: 'aaj', ابھی: 'abhi', جلدی: 'jaldi urgent', فوری: 'urgent',
  کا: 'ka', کی: 'ki', کے: 'ke', سے: 'se', پر: 'par', میں: 'mein', اور: 'aur', کو: 'ko', بھی: 'bhi', تو: 'to',
};

const URDU_LETTER = '؀-ۿݐ-ݿ';
const hasUrdu = s => new RegExp(`[${URDU_LETTER}]`).test(String(s || ''));

function normalize(s) {
  return String(s || '')
    .replace(/[ً-ٰٟ]/g, '') // zabar, zer, pesh
    .replace(/ي|ى/g, 'ی').replace(/ك/g, 'ک').replace(/ۂ|ة/g, 'ہ')
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace(/[،؟۔؛]/g, ' ');
}

const escapeRx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PHRASE_LIST = Object.keys(PHRASES).sort((a, b) => b.length - a.length);
const PHRASE_RX = new RegExp(`(?<![${URDU_LETTER}])(?:${PHRASE_LIST.map(escapeRx).join('|')})(?![${URDU_LETTER}])`, 'g');
const WORD_RX = new RegExp(`[${URDU_LETTER}]+`, 'g');

// Words it does not know are dropped: the rules and the classifier only work with words they know anyway.
function toRoman(text) {
  if (!hasUrdu(text)) return String(text || '');
  return normalize(text).replace(PHRASE_RX, m => ` ${PHRASES[m]} `).replace(WORD_RX, w => WORDS[w] || ' ').replace(/\s+/g, ' ').trim();
}

module.exports = { hasUrdu, toRoman };
