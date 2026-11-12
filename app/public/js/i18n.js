// Urdu for the resident and member screens.
//
// The screens are written in English. In Urdu mode this module translates what reaches the page:
//   - t(text): one string, by exact match, then by pattern (strings with names, amounts, dates or addresses)
//   - trMsg(markdown): the assistant's and the reporter's messages, line by line, before they are formatted
//   - a MutationObserver translates every text node and placeholder added to the page, so screens, cards,
//     toasts and progress steps need no changes of their own
// Anything without a translation stays in English. DHA's own content (procedures, fees, Byelaws, notices)
// comes from the website in English and is not translated; the screens that show it say so.
// Staff pages (Settings, demo control panel) are marked data-no-tr and stay in English.

const KEY = 'dha-lang';
let lang = (() => { try { return localStorage.getItem(KEY) === 'ur' ? 'ur' : 'en'; } catch { return 'en'; } })();

export const isUr = () => lang === 'ur';
export const loc = () => (lang === 'ur' ? 'ur-PK' : 'en-GB'); // dates: Urdu month names, Western digits
export const hasUrdu = s => /[؀-ۿ]/.test(String(s || ''));

export function setLang(l) {
  lang = l === 'ur' ? 'ur' : 'en';
  try { localStorage.setItem(KEY, lang); } catch { /* storage may be blocked */ }
}

// ---------- Exact strings ----------

const EXACT = {
  // Page shell
  'Prototype · information from the DHA public website (Oct 2026), still being checked by DHA': 'نمونہ · معلومات ڈی ایچ اے کی عوامی ویب سائٹ (اکتوبر 2026) سے لی گئی ہیں، ڈی ایچ اے ابھی ان کی جانچ کر رہا ہے',
  'Resident Help': 'رہائشی مدد', 'Islamabad · Rawalpindi': 'اسلام آباد · راولپنڈی', Home: 'ہوم', 'Sign in': 'سائن اِن', 'Sign out': 'سائن آؤٹ',
  'Prefer to talk to a person?': 'کسی فرد سے بات کرنا چاہتے ہیں؟', Complaints: 'شکایات', 'DHA helpline': 'ڈی ایچ اے ہیلپ لائن', Helpline: 'ہیلپ لائن',
  'Settings (for staff)': 'سیٹنگز (عملے کے لیے)', Notifications: 'اطلاعات', 'Switch demo person': 'ڈیمو فرد بدلیں', Back: 'واپس', Me: 'میں',

  // Home
  'Assalam-o-Alaikum.': 'السلام علیکم۔', 'How can we help you today?': 'آج ہم آپ کی کیا مدد کر سکتے ہیں؟',
  'Ask in your own words, or tap one of the big buttons below.': 'اپنے الفاظ میں پوچھیں، یا نیچے دیے گئے بڑے بٹنوں میں سے کوئی ایک دبائیں۔',
  'For example: How do I transfer my plot to my son?': 'مثلاً: میں اپنا پلاٹ اپنے بیٹے کے نام کیسے منتقل کروں؟',
  'Type your question': 'اپنا سوال لکھیں', 'Type your question here…': 'اپنا سوال یہاں لکھیں…', Ask: 'پوچھیں', Send: 'بھیجیں',
  'Ask a question': 'سوال پوچھیں', "Our assistant answers using DHA's official procedures": 'ہمارا معاون ڈی ایچ اے کے سرکاری طریقۂ کار کے مطابق جواب دیتا ہے',
  'How do I…?': 'میں کیسے کروں…؟', 'Steps, documents and fees for every DHA service': 'ڈی ایچ اے کی ہر سروس کے مراحل، کاغذات اور فیس',
  'Report a problem': 'مسئلہ درج کرائیں', 'Tell us in your own words: plumber, water, electricity, street lights and more': 'اپنے الفاظ میں بتائیں: پلمبر، پانی، بجلی، اسٹریٹ لائٹ اور بہت کچھ',
  'My complaints': 'میری شکایات', 'See every update, and tell us when it is fixed': 'ہر اپ ڈیٹ دیکھیں، اور مسئلہ حل ہونے پر ہمیں بتائیں',
  'Buy a plot': 'پلاٹ خریدیں', 'DHA plots for sale, prices and payment plans': 'ڈی ایچ اے کے برائے فروخت پلاٹ، قیمتیں اور ادائیگی کے منصوبے',
  'Build a house': 'گھر بنائیں', 'Steps, building limits, fees and fines for your plot size': 'آپ کے پلاٹ کے سائز کے مطابق مراحل، تعمیر کی حدیں، فیس اور جرمانے',
  'Phone numbers': 'فون نمبر', 'Emergency, security, offices and helplines': 'ایمرجنسی، سیکیورٹی، دفاتر اور ہیلپ لائنز',
  Forms: 'فارم', 'Download and print DHA forms': 'ڈی ایچ اے کے فارم ڈاؤن لوڈ اور پرنٹ کریں',
  'My property, installments and bills': 'میری جائیداد، اقساط اور بل',
  'Plot details, payment plan and overdue installments, society bills and payment history': 'پلاٹ کی تفصیل، ادائیگی کا منصوبہ، واجب الادا اقساط، سوسائٹی بل اور ادائیگیوں کا ریکارڈ',
  'Latest notices': 'تازہ نوٹس',

  // Home: "For you"
  'For you today': 'آج آپ کے لیے', 'Nothing needs your attention today.': 'آج آپ کے لیے کوئی کام باقی نہیں۔',
  'Your bills, instalments, applications and complaints are all up to date.': 'آپ کے بل، اقساط، درخواستیں اور شکایات سب درست ہیں۔',
  'Pay now': 'ابھی ادا کریں', 'See details': 'تفصیل دیکھیں', 'Open': 'کھولیں', 'Pay the voucher': 'ووچر ادا کریں', 'See what is missing': 'دیکھیں کیا باقی ہے',
  'Looking for a plot?': 'پلاٹ کی تلاش ہے؟', 'See plots for sale': 'برائے فروخت پلاٹ دیکھیں', 'Answer now': 'ابھی جواب دیں', 'Pay to confirm': 'تصدیق کے لیے ادائیگی کریں',
  'Your application needs documents': 'آپ کی درخواست کے لیے کاغذات درکار ہیں',

  // Sign in
  'Demo:': 'ڈیمو:', 'choose a person. In the real portal you sign in with your CNIC and the code DHA sends to your mobile.': 'ایک فرد منتخب کریں۔ اصل پورٹل میں آپ اپنے شناختی کارڈ نمبر اور ڈی ایچ اے کی طرف سے موبائل پر بھیجے گئے کوڈ سے سائن اِن کریں گے۔',
  'signed in': 'سائن اِن ہیں', 'Please sign in': 'براہ کرم سائن اِن کریں',
  'Prospect: looking to buy a plot': 'پلاٹ خریدنے کے خواہشمند', 'Member: paying installments': 'ممبر: اقساط ادا کر رہے ہیں', 'Owner-builder: about to build': 'پلاٹ کے مالک: گھر بنانے والے',
  'Resident: lives in DHA': 'رہائشی: ڈی ایچ اے میں رہتے ہیں', 'Resident and member of a second plot': 'رہائشی، اور ایک اور پلاٹ کے ممبر',
  'Reporting a problem': 'مسئلہ درج کرانا', 'Your complaint list': 'آپ کی شکایات کی فہرست', 'Your notifications': 'آپ کی اطلاعات', 'Your account': 'آپ کا اکاؤنٹ',

  // Report a problem
  'Start again': 'دوبارہ شروع کریں', 'Checking…': 'جانچ ہو رہی ہے…', 'Please check': 'براہ کرم جانچ لیں', 'Or tap one:': 'یا ایک دبائیں:',
  Problem: 'مسئلہ', Category: 'قسم', Details: 'تفصیل', 'Visit time': 'آنے کا وقت', Where: 'جگہ', Contact: 'رابطہ', Priority: 'ترجیح', Urgent: 'فوری',
  'Exact spot': 'صحیح جگہ', Since: 'کب سے', 'Who is affected': 'کون متاثر ہے', 'Inside or outside': 'اندر یا باہر', 'Bill month': 'بل کا مہینہ',
  'Payment reference': 'ادائیگی کا حوالہ', 'Happening now': 'ابھی ہو رہا ہے', Needed: 'کب چاہیے', Payment: 'ادائیگی', Month: 'مہینہ',
  '(from your profile)': '(آپ کی پروفائل سے)', 'from your profile': 'آپ کی پروفائل سے',
  'Send complaint': 'شکایت بھیجیں', 'Wrong type, change it': 'قسم غلط ہے، تبدیل کریں', Cancel: 'منسوخ کریں', 'Talk to a person': 'کسی فرد سے بات کریں',
  'Type here…': 'یہاں لکھیں…', 'Type here': 'یہاں لکھیں', 'Anything to add? (optional)': 'کچھ اور بتانا ہے؟ (اختیاری)', 'Or type your own answer': 'یا اپنا جواب لکھیں',
  'For example: kitchen tap is leaking since morning': 'مثلاً: صبح سے کچن کا نل ٹپک رہا ہے', 'Your answer': 'آپ کا جواب',
  'Add this to that complaint': 'یہ اُسی شکایت میں شامل کریں', 'No, this is a new problem': 'نہیں، یہ نیا مسئلہ ہے',
  'Follow that complaint for updates': 'اپ ڈیٹس کے لیے اُس شکایت کو فالو کریں', 'My house is different, report mine': 'میرا گھر الگ ہے، میری شکایت درج کریں',
  'That answers my question': 'میرے سوال کا جواب مل گیا', 'I still want to complain': 'پھر بھی شکایت درج کرائیں', 'See that complaint': 'وہ شکایت دیکھیں',
  'Report something else': 'کوئی اور مسئلہ درج کرائیں', 'See my complaint': 'میری شکایت دیکھیں', 'Open My account': 'میرا اکاؤنٹ کھولیں', 'Back to home': 'ہوم پر واپس',
  'Show more types': 'مزید اقسام دکھائیں', 'Something else': 'کچھ اور', 'Try again': 'دوبارہ کوشش کریں', 'See that order': 'وہ آرڈر دیکھیں', 'Call 1092': '1092 پر کال کریں',
  // Questions the reporter asks (data/cms_templates.json and core/intake.js) and their answers
  'When is someone at home for the visit?': 'ٹیم کے آنے پر گھر میں کوئی کب موجود ہوگا؟',
  'Morning (9 to 12)': 'صبح (9 سے 12)', 'Afternoon (12 to 4)': 'دوپہر (12 سے 4)', 'Evening (4 to 8)': 'شام (4 سے 8)', 'Any time today': 'آج کسی بھی وقت',
  'Where exactly is it?': 'یہ بالکل کہاں ہے؟', 'In front of my house': 'میرے گھر کے سامنے', 'On the street': 'گلی میں', 'In an empty plot nearby': 'قریب کے خالی پلاٹ میں', 'In the park or green area': 'پارک یا گرین ایریا میں',
  'Since when?': 'کب سے؟', 'Less than an hour': 'ایک گھنٹے سے کم', 'A few hours': 'چند گھنٹوں سے', 'Since yesterday': 'کل سے', 'More than a day': 'ایک دن سے زیادہ',
  'Is it the whole house, or are neighbours also affected?': 'کیا پورا گھر متاثر ہے، یا پڑوسی بھی؟', 'Only part of my house': 'گھر کا صرف کچھ حصہ', 'My whole house': 'پورا گھر', 'Neighbours too': 'پڑوسی بھی',
  'Is it inside or outside the house?': 'یہ گھر کے اندر ہے یا باہر؟', 'Inside the house': 'گھر کے اندر', 'Outside the house': 'گھر کے باہر',
  "Which month's bill is it about?": 'کس مہینے کے بل کی بات ہے؟', 'This month': 'اس مہینے', 'Last month': 'پچھلے مہینے', Older: 'اس سے پہلے',
  'If you have already paid, what is the payment reference? (write "none" if not paid)': 'اگر آپ ادائیگی کر چکے ہیں تو ادائیگی کا حوالہ کیا ہے؟ (ادا نہیں کیا تو "none" لکھیں)',
  'Is it happening right now?': 'کیا یہ ابھی ہو رہا ہے؟', 'Yes, right now': 'جی ہاں، ابھی', 'No, it happened earlier': 'نہیں، پہلے ہوا تھا',
  'Where is it?': 'یہ کہاں ہے؟', 'Next to my house': 'میرے گھر کے ساتھ', 'On my street': 'میری گلی میں', 'Elsewhere in the sector': 'سیکٹر میں کہیں اور',
  'When do you need the water tanker?': 'پانی کا ٹینکر کب چاہیے؟', 'As soon as possible': 'جتنی جلدی ہو سکے', 'This evening': 'آج شام', 'Tomorrow morning': 'کل صبح',
  "A water tanker is a paid service, charged at DHA's current rate. How would you like to pay?": 'پانی کا ٹینکر ایک ادا شدہ سروس ہے، ڈی ایچ اے کے موجودہ ریٹ کے مطابق۔ آپ کیسے ادائیگی کرنا چاہیں گے؟',
  'Pay now (demo)': 'ابھی ادا کریں (ڈیمو)', 'Pay on delivery': 'ٹینکر آنے پر ادائیگی',

  // Complaint types (core/intake.js) and CMS categories
  'Plumber (taps, leaks, flush, drains in the house)': 'پلمبر (گھر میں نل، لیکیج، فلش، نالیاں)', 'Water tanker (bowzer) delivery': 'پانی کا ٹینکر (باؤزر)',
  'Electrician (switches, fans, wiring in the house)': 'الیکٹریشن (گھر میں سوئچ، پنکھے، وائرنگ)', 'Wild grass or bushes to cut': 'جنگلی گھاس یا جھاڑیاں کاٹنی ہیں',
  'Street light not working': 'اسٹریٹ لائٹ خراب ہے', 'No electricity': 'بجلی نہیں ہے', 'Carpenter (doors, locks, windows)': 'بڑھئی (دروازے، تالے، کھڑکیاں)',
  'No water, or low water supply': 'پانی نہیں آ رہا، یا کم آ رہا ہے', 'Sanitary worker (blocked drain or gutter)': 'سینیٹری ورکر (بند نالی یا گٹر)',
  'Garbage bags not delivered': 'کچرے کے تھیلے نہیں ملے', 'Area needs cleaning': 'علاقے کی صفائی درکار ہے', 'Tree branches to trim': 'درخت کی شاخیں کاٹنی ہیں',
  'Road needs sweeping': 'سڑک پر جھاڑو درکار ہے', 'Park or green belt needs cleaning': 'پارک یا گرین بیلٹ کی صفائی درکار ہے', 'One electricity phase missing': 'بجلی کا ایک فیز غائب ہے',
  'Sewerage overflowing outside': 'باہر سیوریج اُبل رہا ہے', 'Garbage not collected': 'کچرا نہیں اٹھایا گیا', 'Geyser not working': 'گیزر خراب ہے',
  'Gas leak in the house': 'گھر میں گیس لیک', 'Gas leak (Sui gas line)': 'گیس لیک (سوئی گیس لائن)', 'Mosquito (dengue) spray': 'مچھر مار (ڈینگی) اسپرے',
  'Voltage going up and down': 'وولٹیج اوپر نیچے ہو رہا ہے', 'Short circuit or sparking': 'شارٹ سرکٹ یا چنگاریاں', 'Stray dogs or cats': 'آوارہ کتے یا بلیاں',
  'Damaged road or pothole': 'ٹوٹی سڑک یا گڑھا', 'Utility bill not received': 'یوٹیلیٹی بل نہیں ملا', 'Bill already paid but still showing': 'بل ادا کر دیا مگر ابھی بھی واجب دکھا رہا ہے',
  'Wrong bill amount': 'بل کی رقم غلط ہے', 'Suspicious activity': 'مشکوک سرگرمی', 'Loud music or party noise': 'اونچی موسیقی یا پارٹی کا شور', 'Irregular construction nearby': 'قریب میں غیر قانونی تعمیر',
  Plumber: 'پلمبر', Electrician: 'الیکٹریشن', 'Water Bowzer': 'پانی کا ٹینکر', 'Street Light': 'اسٹریٹ لائٹ', 'Electricity Out of Order': 'بجلی بند', Carpenter: 'بڑھئی',
  'Shortage Of Water Supply': 'پانی کی کمی', 'Sanitary Worker': 'سینیٹری ورکر', 'Garbage Bags': 'کچرے کے تھیلے', Cleanliness: 'صفائی', 'Tree Trimming': 'درختوں کی کٹائی',
  'Road Cleaning': 'سڑک کی صفائی', 'Phase Missing': 'فیز غائب', 'Outdoor Sewerage Line': 'باہر کی سیوریج لائن', 'Garbage Collection': 'کچرا اٹھانا', Geyser: 'گیزر',
  'Leakage Complaints': 'لیکیج کی شکایت', 'Dengue Spray': 'ڈینگی اسپرے', Fluctuation: 'وولٹیج کا اتار چڑھاؤ', 'Short Circuit': 'شارٹ سرکٹ', 'Actions Wild Growth Cutting': 'جنگلی گھاس کی کٹائی',
  Plumbing: 'پلمبنگ', Electricity: 'بجلی', Horticulture: 'باغبانی', 'Community Services': 'کمیونٹی سروسز', Sanitation: 'صفائی ستھرائی', Garbage: 'کچرا',
  'Roads & Streets': 'سڑکیں اور گلیاں', 'Service and Maintenance': 'سروس اور مرمت', 'SUI Gas': 'سوئی گیس', Dengue: 'ڈینگی', 'Stray Animals': 'آوارہ جانور',
  'Utility Bills': 'یوٹیلیٹی بل', Security: 'سیکیورٹی', 'Building Control': 'بلڈنگ کنٹرول', Other: 'دیگر', Others: 'دیگر', 'Town Planning': 'ٹاؤن پلاننگ',

  // Complaint statuses and what they mean
  Submitted: 'درج ہو گئی', 'In Process': 'کارروائی جاری', Pending: 'زیرِ التوا', Reopen: 'دوبارہ کھولی گئی', Resolved: 'حل ہو گئی', Closed: 'بند', 'Cancel/Not at Home': 'گھر پر کوئی نہیں تھا',
  'Received. Waiting for a team to be assigned.': 'موصول ہو گئی۔ ٹیم مقرر ہونے کا انتظار ہے۔', 'A field team is working on it.': 'فیلڈ ٹیم اس پر کام کر رہی ہے۔', 'On hold.': 'روک دی گئی ہے۔',
  'Opened again. It goes back to the team.': 'دوبارہ کھولی گئی۔ یہ واپس ٹیم کے پاس جاتی ہے۔', 'The team says the work is done.': 'ٹیم کے مطابق کام مکمل ہو گیا ہے۔', 'Closed.': 'بند ہو گئی۔',
  'Cancelled.': 'منسوخ ہو گئی۔', 'The team came but no one was at home.': 'ٹیم آئی مگر گھر پر کوئی نہیں تھا۔', 'Note added': 'نوٹ شامل کیا گیا',

  // My complaints and a complaint
  Earlier: 'پہلے کی', Updated: 'اپ ڈیٹ', 'Following ·': 'فالو کر رہے ہیں ·',
  'You have no complaints. When you report a problem, it shows here with every update.': 'آپ کی کوئی شکایت نہیں۔ جب آپ کوئی مسئلہ درج کرائیں گے تو وہ ہر اپ ڈیٹ کے ساتھ یہاں نظر آئے گا۔',
  'Is the problem fixed?': 'کیا مسئلہ حل ہو گیا؟', 'Yes, it is fixed': 'جی ہاں، ٹھیک ہو گیا', 'No, still a problem': 'نہیں، مسئلہ ابھی باقی ہے',
  'The team could not get in.': 'ٹیم اندر نہیں جا سکی۔', 'Ask for another visit?': 'دوبارہ آنے کی درخواست کریں؟', 'Ask for another visit': 'دوبارہ آنے کی درخواست کریں',
  Type: 'قسم', Made: 'درج کی گئی', Team: 'ٹیم', 'What has happened': 'اب تک کیا ہوا', 'Add information for the team (optional)': 'ٹیم کے لیے مزید معلومات (اختیاری)',
  'Add information for the team': 'ٹیم کے لیے مزید معلومات', Add: 'شامل کریں', 'Cancel complaint': 'شکایت منسوخ کریں', 'Simulate field team update (demo)': 'فیلڈ ٹیم کی اپ ڈیٹ دکھائیں (ڈیمو)',
  'Complaint Office 1092': 'شکایت دفتر 1092', 'Work completed by the field team.': 'فیلڈ ٹیم نے کام مکمل کر دیا۔', 'Received through Resident Portal.': 'رہائشی پورٹل کے ذریعے موصول ہوئی۔',

  // Notifications
  'Nothing yet. Updates on your complaints will appear here.': 'ابھی کچھ نہیں۔ آپ کی شکایات کی اپ ڈیٹس یہاں نظر آئیں گی۔',
  'Yes, fixed': 'جی ہاں، ٹھیک ہے', 'Not fixed': 'ٹھیک نہیں ہوا', 'Society bill paid': 'سوسائٹی بل ادا ہو گیا',
  'The field team says the work is done. Is the problem fixed?': 'فیلڈ ٹیم کے مطابق کام مکمل ہو گیا ہے۔ کیا مسئلہ حل ہو گیا؟', 'This complaint is now closed.': 'یہ شکایت اب بند ہو گئی ہے۔',
  'The team has put it on hold.': 'ٹیم نے اسے روک دیا ہے۔', 'The complaint is open again and goes back to the team.': 'شکایت دوبارہ کھل گئی ہے اور واپس ٹیم کے پاس جاتی ہے۔',
  'This complaint was cancelled.': 'یہ شکایت منسوخ کر دی گئی۔', 'The team visited but no one was at home. You can ask for another visit.': 'ٹیم آئی مگر گھر پر کوئی نہیں تھا۔ آپ دوبارہ آنے کی درخواست کر سکتے ہیں۔',

  // My account
  Member: 'ممبر', Resident: 'رہائشی', 'Plot owner': 'پلاٹ کے مالک', 'Not yet a member': 'ابھی ممبر نہیں',
  'Prototype: all amounts below are demo figures, not DHA records.': 'نمونہ: نیچے دی گئی تمام رقوم ڈیمو کے لیے ہیں، ڈی ایچ اے کا ریکارڈ نہیں۔',
  Active: 'فعال', Plot: 'پلاٹ', Built: 'تعمیر', 'House built': 'گھر بنا ہوا ہے', 'Empty plot': 'خالی پلاٹ', Document: 'دستاویز',
  'Allotment letter': 'الاٹمنٹ لیٹر', 'Allotment certificate': 'الاٹمنٹ سرٹیفکیٹ', 'Payment plan': 'ادائیگی کا منصوبہ',
  'Paid so far': 'اب تک ادا', 'Next due': 'اگلی قسط', 'Nothing more due': 'مزید کچھ واجب نہیں', Remaining: 'باقی', Due: 'آخری تاریخ', Amount: 'رقم', Status: 'حیثیت',
  Booking: 'بکنگ', Paid: 'ادا شدہ', Overdue: 'تاخیر شدہ', Upcoming: 'آنے والی', 'To pay': 'ادا کرنا ہے', 'All paid': 'سب ادا ہو گیا',
  'Applications with DHA': 'ڈی ایچ اے میں درخواستیں', 'Planning to build?': 'گھر بنانے کا ارادہ ہے؟', 'Report a problem at this house': 'اس گھر کا مسئلہ درج کرائیں',
  'No DHA property yet': 'ابھی ڈی ایچ اے میں کوئی جائیداد نہیں', 'When you buy a plot or house, its details, installments and bills show here.': 'جب آپ پلاٹ یا گھر خریدیں گے تو اس کی تفصیل، اقساط اور بل یہاں نظر آئیں گے۔',
  'See plots DHA is selling': 'ڈی ایچ اے کے برائے فروخت پلاٹ دیکھیں', 'How buying and transfer works': 'خریداری اور منتقلی کیسے ہوتی ہے',
  Owner: 'مالک', Allottee: 'الاٹی', 'Joint owner': 'مشترکہ مالک',
  // Paying a bill
  'Pay this bill': 'یہ بل ادا کریں', 'Pay by': 'ادائیگی کا طریقہ', 'Debit or credit card': 'ڈیبٹ یا کریڈٹ کارڈ', '1Bill': '1Bill',
  'Bank transfer (EFT)': 'بینک ٹرانسفر (EFT)', 'Roshan Digital Account': 'روشن ڈیجیٹل اکاؤنٹ', 'Roshan Digital Account (overseas)': 'روشن ڈیجیٹل اکاؤنٹ (بیرونِ ملک)',
  'Debit or credit card (online)': 'ڈیبٹ یا کریڈٹ کارڈ (آن لائن)', 'Demo: no money moves.': 'ڈیمو: کوئی رقم منتقل نہیں ہوتی۔', 'Payment received': 'ادائیگی موصول ہو گئی',
  'Print receipt': 'رسید پرنٹ کریں',

  // Applications (site plan, building plan)
  'Site plan and possession': 'سائٹ پلان اور قبضہ', 'Building plan approval': 'بلڈنگ پلان کی منظوری', 'Your applications with DHA': 'ڈی ایچ اے میں آپ کی درخواستیں',
  Received: 'موصول', 'Documents being checked': 'کاغذات کی جانچ', 'Drawings being checked': 'نقشوں کی جانچ', 'Documents missing': 'کاغذات نامکمل', 'Changes needed': 'تبدیلیاں درکار',
  'Fee voucher issued': 'فیس ووچر جاری', 'Fee paid': 'فیس ادا', 'Site plan issued': 'سائٹ پلان جاری', 'Plot under development': 'پلاٹ زیرِ تعمیر علاقے میں ہے', 'Drawings approved': 'نقشے منظور',
  'DHA checks your documents.': 'ڈی ایچ اے آپ کے کاغذات چیک کرتا ہے۔', 'If they are complete, DHA issues a fee voucher.': 'کاغذات مکمل ہوں تو ڈی ایچ اے فیس ووچر جاری کرتا ہے۔',
  'If they meet the byelaws, DHA issues a fee voucher.': 'اگر نقشے قواعد کے مطابق ہوں تو ڈی ایچ اے فیس ووچر جاری کرتا ہے۔',
  'Some documents are missing or incomplete. Submit them to the office so the check can continue.': 'کچھ کاغذات نہیں ہیں یا نامکمل ہیں۔ جانچ جاری رکھنے کے لیے یہ دفتر میں جمع کرائیں۔',
  'Building Control has observations on the drawings. Ask your architect to revise them and resubmit.': 'بلڈنگ کنٹرول کو نقشوں پر اعتراضات ہیں۔ اپنے آرکیٹیکٹ سے درست کروا کر دوبارہ جمع کرائیں۔',
  'Pay the voucher by its due date. DHA continues once the payment is verified.': 'ووچر آخری تاریخ تک ادا کریں۔ ادائیگی کی تصدیق کے بعد ڈی ایچ اے کارروائی آگے بڑھاتا ہے۔',
  'DHA verifies the payment and completes the application.': 'ڈی ایچ اے ادائیگی کی تصدیق کر کے درخواست مکمل کرتا ہے۔',
  'Done. Next for most owners: drawings for Building Control.': 'مکمل۔ اگلا قدم: بلڈنگ کنٹرول کے لیے نقشے۔',
  'The plot is still being developed, so the site plan and possession wait until the area is ready.': 'علاقہ ابھی تیار ہو رہا ہے، اس لیے سائٹ پلان اور قبضہ علاقہ تیار ہونے تک رُکے ہیں۔',
  'Done. You can register your contractor and get the plot demarcated.': 'مکمل۔ اب آپ اپنا ٹھیکیدار رجسٹر کرا کر پلاٹ کی حد بندی کرا سکتے ہیں۔',
  'Your turn': 'آپ کی باری', 'With DHA': 'ڈی ایچ اے کے پاس', Done: 'مکمل', "From DHA's membership portal (sample data).": 'ڈی ایچ اے کے ممبرشپ پورٹل سے (نمونہ ڈیٹا)۔',
  'Demo: DHA office takes the next step': 'ڈیمو: ڈی ایچ اے دفتر اگلا قدم اٹھاتا ہے',
  "Demo: no money moves. These payment methods are the ones recorded in DHA's membership portal; DHA to confirm the details.": 'ڈیمو: کوئی رقم منتقل نہیں ہوتی۔ یہ ادائیگی کے طریقے ڈی ایچ اے کے ممبرشپ پورٹل میں درج ہیں؛ تفصیل کی تصدیق ڈی ایچ اے کرے گا۔',
  'No site plan or building plan application on this plot yet. The steps below show how to start.': 'اس پلاٹ پر ابھی سائٹ پلان یا بلڈنگ پلان کی کوئی درخواست نہیں۔ نیچے کے مراحل بتاتے ہیں کہ کیسے شروع کریں۔',

  // Build a house
  'The steps from possession to moving in, with the building limits, fees and fines for your plot size.': 'قبضے سے گھر میں منتقل ہونے تک کے مراحل، آپ کے پلاٹ کے سائز کے مطابق تعمیر کی حدیں، فیس اور جرمانے۔',
  "Guidance from the DHA Byelaws 2022 (updated 2023) and the Schedule of Charges. Your site plan and building plan applications come from DHA's membership portal; the ticks in the steps below are your own checklist.": 'ڈی ایچ اے بائی لاز 2022 (ترمیم 2023) اور فیسوں کے شیڈول سے رہنمائی۔ آپ کی سائٹ پلان اور بلڈنگ پلان کی درخواستیں ڈی ایچ اے کے ممبرشپ پورٹل سے ہیں؛ نیچے مراحل پر نشان آپ کی اپنی چیک لسٹ ہیں۔',
  'Guidance from the DHA Byelaws 2022 (updated 2023) and the Schedule of Charges. Sign in to see your own site plan and building plan applications.': 'ڈی ایچ اے بائی لاز 2022 (ترمیم 2023) اور فیسوں کے شیڈول سے رہنمائی۔ اپنی سائٹ پلان اور بلڈنگ پلان کی درخواستیں دیکھنے کے لیے سائن اِن کریں۔',
  'Your plots': 'آپ کے پلاٹ', 'Or see the rules for another size': 'یا کسی اور سائز کے قواعد دیکھیں', 'Choose a plot size': 'پلاٹ کا سائز منتخب کریں',
  'Ground floor': 'گراؤنڈ فلور', 'First floor': 'فرسٹ فلور', 'Open space in front': 'سامنے کھلی جگہ', 'Back and sides': 'پیچھے اور اطراف', Height: 'اونچائی', 'Also required': 'یہ بھی ضروری ہے',
  'Please ask Building Control for this plot size': 'اس سائز کے لیے بلڈنگ کنٹرول سے پوچھیں', 'Please confirm with DHA': 'ڈی ایچ اے سے تصدیق کریں', 'Please confirm': 'تصدیق کریں',
  'The steps': 'مراحل', 'All steps ticked': 'تمام مراحل مکمل', 'Documents, forms and contacts': 'کاغذات، فارم اور رابطے', 'Mark as done': 'مکمل ہو گیا', 'Not done yet': 'ابھی مکمل نہیں',
  'Avoid these fines': 'ان جرمانوں سے بچیں', 'Ask about building rules': 'تعمیر کے قواعد کے بارے میں پوچھیں', 'Building Control phone numbers': 'بلڈنگ کنٹرول کے فون نمبر',
  'Take possession and get the site plan': 'قبضہ لیں اور سائٹ پلان حاصل کریں', 'Get your drawings approved': 'اپنے نقشے منظور کرائیں', 'Register your contractor and labour': 'اپنا ٹھیکیدار اور مزدور رجسٹر کرائیں',
  'Get the plot demarcated': 'پلاٹ کی حد بندی کرائیں', 'Build, with inspections at each stage': 'ہر مرحلے پر معائنے کے ساتھ تعمیر کریں', 'Get the NOC to move in': 'رہائش کے لیے این او سی لیں',
  'Get the completion certificate': 'تکمیل کا سرٹیفکیٹ لیں', 'Get permanent water and sewerage connections': 'پانی اور سیوریج کے مستقل کنکشن لیں',
  'Building a house: the steps': 'گھر بنانا: مراحل', 'Open the step-by-step guide': 'مرحلہ وار رہنمائی کھولیں',

  // Buy a plot
  'Buy a plot from DHA': 'ڈی ایچ اے سے پلاٹ خریدیں', Phase: 'فیز', Size: 'سائز', Budget: 'بجٹ', Sort: 'ترتیب', 'All phases': 'تمام فیز',
  'Residential and commercial': 'رہائشی اور کمرشل', Residential: 'رہائشی', Commercial: 'کمرشل', 'Any size': 'کوئی بھی سائز', 'Any price': 'کوئی بھی قیمت',
  'Lowest price first': 'کم قیمت پہلے', 'Highest price first': 'زیادہ قیمت پہلے', 'Largest first': 'بڑا پلاٹ پہلے', 'Balloted plot': 'بیلٹ شدہ پلاٹ', 'Your booking': 'آپ کی بکنگ',
  'Prototype: prices are the lower end of the DHA Property Exchange benchmark (PVBM). Plan terms, token and payments are demo only. DHA to confirm.': 'نمونہ: قیمتیں ڈی ایچ اے پراپرٹی ایکسچینج بینچ مارک (PVBM) کی نچلی حد ہیں۔ منصوبے کی شرائط، ٹوکن اور ادائیگیاں صرف ڈیمو ہیں۔ تصدیق ڈی ایچ اے کرے گا۔',
  Price: 'قیمت', Location: 'مقام', 'Token to book': 'بکنگ کا ٹوکن', 'For sale': 'برائے فروخت', 'Choose how to pay': 'ادائیگی کا طریقہ منتخب کریں', 'Sign in to book': 'بکنگ کے لیے سائن اِن کریں',
  'The plot is held for you for 72 hours while you pay the down payment.': 'ڈاؤن پیمنٹ ادا کرنے کے لیے پلاٹ 72 گھنٹے آپ کے لیے روکا جاتا ہے۔', 'Booking is in your name, by CNIC.': 'بکنگ آپ کے نام پر، شناختی کارڈ نمبر کے ساتھ ہوتی ہے۔',
  'See DHA plots for sale': 'ڈی ایچ اے کے برائے فروخت پلاٹ دیکھیں', 'Benchmark, not a price list': 'بینچ مارک، سرکاری قیمتوں کی فہرست نہیں',

  // How do I…?
  'Most asked:': 'سب سے زیادہ پوچھے گئے:', 'Or choose a topic:': 'یا موضوع منتخب کریں:', 'All topics': 'تمام موضوعات',
  'Sell / transfer a plot': 'پلاٹ بیچیں / منتقل کریں', 'Get an NDC': 'این ڈی سی حاصل کریں', 'Lost allotment letter': 'الاٹمنٹ لیٹر گم ہو گیا', 'E-Tag for my car': 'گاڑی کا ای ٹیگ',
  'Pass for maid or driver': 'ملازمہ یا ڈرائیور کا پاس', 'Rent out my house': 'گھر کرائے پر دیں', 'Approve house drawing': 'گھر کا نقشہ منظور کرائیں', 'Burial in DHA graveyard': 'ڈی ایچ اے قبرستان میں تدفین',
  'Buying, selling or gifting property': 'جائیداد کی خرید، فروخت یا ہبہ', 'Transfers, power of attorney, legal heirs': 'منتقلی، مختار نامہ، قانونی ورثاء',
  'Dues, NDC and bank loan papers': 'واجبات، این ڈی سی اور بینک قرض کے کاغذات', 'Statement of dues, No Demand Certificate, lien': 'واجبات کی تفصیل، نو ڈیمانڈ سرٹیفکیٹ، لین',
  'Allotment letter and membership': 'الاٹمنٹ لیٹر اور ممبرشپ', 'Collect, duplicate, address or name change': 'وصولی، نقل، پتہ یا نام کی تبدیلی',
  'Building a house': 'گھر کی تعمیر', 'Possession, drawings, completion, solar': 'قبضہ، نقشے، تکمیل، سولر', 'E-Tag, car sticker and staff passes': 'ای ٹیگ، گاڑی کا اسٹیکر اور ملازمین کے پاس',
  'Vehicle entry, servants, CCTV': 'گاڑیوں کا داخلہ، ملازمین، سی سی ٹی وی', 'Renting out or vacating': 'کرائے پر دینا یا خالی کرنا', 'NOC for tenants': 'کرایہ داروں کے لیے این او سی',
  'Bills, connections and online services': 'بل، کنکشن اور آن لائن سروسز', 'Utility bill, water, member portal': 'یوٹیلیٹی بل، پانی، ممبر پورٹل', 'DHA Valley files': 'ڈی ایچ اے ویلی فائلیں',
  'File opening, endorsement, conversion': 'فائل کھولنا، اندراج، تبدیلی', 'Community and other': 'کمیونٹی اور دیگر', 'Burial, pets, sales lounge, DHA shops': 'تدفین، پالتو جانور، سیلز لاؤنج، ڈی ایچ اے دکانیں',
  'For professionals and vendors': 'ماہرین اور سپلائرز کے لیے', 'Architects, contractors, suppliers, dealers': 'آرکیٹیکٹ، ٹھیکیدار، سپلائرز، ڈیلرز',
  'Step-by-step guide for your plot': 'آپ کے پلاٹ کے لیے مرحلہ وار رہنمائی', 'Print checklist': 'چیک لسٹ پرنٹ کریں', 'Ask about this': 'اس بارے میں پوچھیں',
  'Before you start': 'شروع کرنے سے پہلے', Steps: 'مراحل', 'Documents to bring': 'ساتھ لانے والے کاغذات', 'Tick each one as you get it ready': 'ہر کاغذ تیار ہونے پر نشان لگائیں',
  'Stamp paper': 'اسٹامپ پیپر', Fees: 'فیس', 'How long it takes': 'کتنا وقت لگتا ہے', 'Forms you need': 'درکار فارم', 'Who to contact': 'کس سے رابطہ کریں', 'Common questions': 'عام سوالات',
  'Who applies': 'کون درخواست دے', 'Go in person?': 'خود جانا ہوگا؟', 'How long': 'کتنا وقت', 'How to apply': 'درخواست کیسے دیں', Download: 'ڈاؤن لوڈ',
  'Not online — ask at office': 'آن لائن نہیں — دفتر سے لیں', 'Choose your plot size to see your fee:': 'اپنی فیس دیکھنے کے لیے پلاٹ کا سائز منتخب کریں:', Fee: 'فیس', 'Plot size': 'پلاٹ کا سائز',

  // Phone numbers, forms, tracking
  'Urgent help': 'فوری مدد', 'Find an office': 'دفتر تلاش کریں', 'Type a topic, e.g. NDC, E-Tag, Phase II security': 'موضوع لکھیں، مثلاً NDC، E-Tag، Phase II security',
  'Search phone numbers': 'فون نمبر تلاش کریں', 'Tap Download to open the form. Print it, fill it in, and take it to the office named in the service steps.': 'فارم کھولنے کے لیے ڈاؤن لوڈ دبائیں۔ پرنٹ کریں، پُر کریں، اور سروس کے مراحل میں بتائے گئے دفتر لے جائیں۔',
  'Search forms, e.g. transfer, NDC, servant': 'فارم تلاش کریں، مثلاً transfer، NDC، servant', 'Search forms': 'فارم تلاش کریں', 'Track my complaint': 'اپنی شکایت ٹریک کریں',
  'Complaint number or mobile number': 'شکایت نمبر یا موبائل نمبر', Find: 'تلاش کریں', 'Number not published': 'نمبر شائع نہیں ہوا',

  // Chat
  'Built-in answers (demo mode)': 'بلٹ اِن جوابات (ڈیمو موڈ)', 'Not what you needed?': 'یہ وہ نہیں جو آپ کو چاہیے تھا؟', 'Call DHA 111-555-400': 'ڈی ایچ اے کو کال کریں 111-555-400',
  or: 'یا', 'browse all services': 'تمام سروسز دیکھیں', 'I am the DHA help assistant. I can explain procedures, documents and fees, give you the right phone number, and register or track a complaint.': 'میں ڈی ایچ اے کا مددگار معاون ہوں۔ میں طریقۂ کار، کاغذات اور فیس سمجھا سکتا ہوں، صحیح فون نمبر دے سکتا ہوں، اور شکایت درج یا ٹریک کر سکتا ہوں۔',
  'Assalam-o-Alaikum!': 'السلام علیکم!', 'You can type in English or Urdu. Try one of these:': 'آپ انگریزی یا اردو میں لکھ سکتے ہیں۔ ان میں سے کوئی آزمائیں:',
  'How do I transfer my plot to my son?': 'میں اپنا پلاٹ اپنے بیٹے کے نام کیسے منتقل کروں؟', 'What documents do I need for an NDC?': 'این ڈی سی کے لیے کون سے کاغذات چاہییں؟',
  'I lost my allotment letter': 'میرا الاٹمنٹ لیٹر گم ہو گیا', 'Transfer fee for 1 kanal plot': '1 کنال پلاٹ کی ٹرانسفر فیس', 'How do I get a pass for my driver?': 'اپنے ڈرائیور کا پاس کیسے بنواؤں؟',
  'There is no water in my house': 'میرے گھر میں پانی نہیں آ رہا', 'Are my bills paid?': 'کیا میرے بل ادا ہو گئے ہیں؟',
  'See full steps and checklist': 'تمام مراحل اور چیک لسٹ دیکھیں', 'Not sent yet': 'ابھی نہیں بھیجی گئی', Continue: 'جاری رکھیں', 'Sign in and continue': 'سائن اِن کر کے جاری رکھیں',
  'Paid service: the next step shows how to pay.': 'ادا شدہ سروس: اگلا قدم ادائیگی کا طریقہ بتاتا ہے۔', 'From your account': 'آپ کے اکاؤنٹ سے', What: 'کیا', Now: 'اب', Next: 'اگلا',
  Unpaid: 'غیر ادا شدہ', 'Up to date': 'سب ادا', 'Fully paid': 'مکمل ادا', 'Society bill': 'سوسائٹی بل', 'Your complaints': 'آپ کی شکایات', 'All my complaints': 'میری تمام شکایات',
  'The AI service could not be reached, so this answer uses built-in information.': 'AI سروس سے رابطہ نہیں ہو سکا، اس لیے یہ جواب بلٹ اِن معلومات سے ہے۔',
  'Checking your message…': 'آپ کا پیغام چیک ہو رہا ہے…', 'Message checked': 'پیغام چیک ہو گیا', 'Understanding your question…': 'آپ کا سوال سمجھا جا رہا ہے…', 'Understood the question': 'سوال سمجھ لیا',
  'Using built-in answers instead': 'اس کی جگہ بلٹ اِن جوابات', 'Reading your account…': 'آپ کا اکاؤنٹ دیکھا جا رہا ہے…', 'Checking your complaints…': 'آپ کی شکایات دیکھی جا رہی ہیں…',
  'Checking your applications in the membership portal…': 'ممبرشپ پورٹل میں آپ کی درخواستیں دیکھی جا رہی ہیں…', 'Searching DHA procedures and FAQs…': 'ڈی ایچ اے کا طریقۂ کار اور عام سوالات تلاش ہو رہے ہیں…',
  'Reading the procedure, documents and fees…': 'طریقۂ کار، کاغذات اور فیس پڑھی جا رہی ہے…', 'Searching the Byelaws and DHA documents…': 'بائی لاز اور ڈی ایچ اے کی دستاویزات تلاش ہو رہی ہیں…',
  'Checking the Schedule of Charges…': 'فیسوں کا شیڈول دیکھا جا رہا ہے…', 'Finding the right office and phone number…': 'صحیح دفتر اور فون نمبر تلاش ہو رہا ہے…', 'Looking for the forms…': 'فارم تلاش ہو رہے ہیں…',
  'Preparing your complaint…': 'آپ کی شکایت تیار ہو رہی ہے…', 'Checking the complaint system…': 'شکایات کا نظام دیکھا جا رہا ہے…', 'Checking DHA plot prices…': 'ڈی ایچ اے پلاٹ کی قیمتیں دیکھی جا رہی ہیں…',
  'Reading the building rules and steps…': 'تعمیر کے قواعد اور مراحل پڑھے جا رہے ہیں…', 'Reading latest notices…': 'تازہ نوٹس پڑھے جا رہے ہیں…',
  'Understood: you are asking about your own account': 'سمجھ گیا: آپ اپنے اکاؤنٹ کے بارے میں پوچھ رہے ہیں', 'Understood: you are asking about your own complaints': 'سمجھ گیا: آپ اپنی شکایات کے بارے میں پوچھ رہے ہیں',
  'Understood: you are asking about your own application with DHA': 'سمجھ گیا: آپ ڈی ایچ اے میں اپنی درخواست کے بارے میں پوچھ رہے ہیں',
  'Not signed in, so your account cannot be read': 'سائن اِن نہیں، اس لیے اکاؤنٹ نہیں دیکھا جا سکتا',
  'DHA procedures, fees and Byelaws are shown in English, as DHA publishes them.': 'ڈی ایچ اے کا طریقۂ کار، فیس اور بائی لاز انگریزی میں ہیں، جیسے ڈی ایچ اے انہیں شائع کرتا ہے۔',
  'This answer is in English because it comes from DHA\'s published information.': 'یہ جواب انگریزی میں ہے کیونکہ یہ ڈی ایچ اے کی شائع شدہ معلومات سے ہے۔',
};

// Case-insensitive lookup for labels used in lower case inside sentences ("a **plumber (taps…)** problem").
const LOWER = new Map(Object.entries(EXACT).map(([k, v]) => [k.toLowerCase(), v]));

// ---------- Patterns ----------

const MONTHS = { Jan: 'جنوری', Feb: 'فروری', Mar: 'مارچ', Apr: 'اپریل', May: 'مئی', Jun: 'جون', Jul: 'جولائی', Aug: 'اگست', Sep: 'ستمبر', Sept: 'ستمبر', Oct: 'اکتوبر', Nov: 'نومبر', Dec: 'دسمبر',
  January: 'جنوری', February: 'فروری', March: 'مارچ', April: 'اپریل', June: 'جون', July: 'جولائی', August: 'اگست', September: 'ستمبر', October: 'اکتوبر', November: 'نومبر', December: 'دسمبر' };
const months = s => s.replace(/\b(January|February|March|April|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Sep|Oct|Nov|Dec)\b/g, m => MONTHS[m]);
const WEEKDAYS = { Mon: 'پیر', Tue: 'منگل', Wed: 'بدھ', Thu: 'جمعرات', Fri: 'جمعہ', Sat: 'ہفتہ', Sun: 'اتوار' };
const dates = s => months(s.replace(/\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b/g, m => WEEKDAYS[m]));

// Addresses and sizes: "Plot 23, Street 9, Sector J, Phase 2", "10 Marla (250 sq yd)".
const ADDR_WORDS = { House: 'مکان', Plot: 'پلاٹ', plot: 'پلاٹ', Street: 'گلی', Sector: 'سیکٹر', Phase: 'فیز', Marla: 'مرلہ', Kanal: 'کنال', 'sq yd': 'مربع گز', 'sq ft': 'مربع فٹ', Residential: 'رہائشی', residential: 'رہائشی', Commercial: 'کمرشل', commercial: 'کمرشل' };
const ADDR_RX = /^(?:(?:House|Plot|plot|Street|Sector|Phase|Marla|Kanal|sq yd|sq ft|Residential|residential|Commercial|commercial|[A-Z]{1,2}\d?|[IVX]+|\d+(?:[.,]\d+)?(?:-\d+)?|[(),·-])\s*)+$/;
const addr = s => s.replace(/, /g, '، ').replace(/sq yd|sq ft|\b(House|Plot|plot|Street|Sector|Phase|Marla|Kanal|Residential|residential|Commercial|commercial)\b/g, m => ADDR_WORDS[m]);
const place = s => (ADDR_RX.test(s) && /House|Plot|Street|Sector|Phase|Marla|Kanal/.test(s) ? addr(s) : t(s));

const P = [
  [/^Assalam-o-Alaikum, (.+)\.$/, (_, n) => `السلام علیکم، ${n}۔`],
  [/^(.+) is personal, so we need to know who you are first\.$/, (_, w) => `${t(w)} ذاتی معلومات ہیں، اس لیے پہلے ہمیں جاننا ہے کہ آپ کون ہیں۔`],
  [/^(.+) · CNIC ([\d-]+)$/, (_, l, c) => `${t(l)} · شناختی کارڈ ${c}`],
  [/^CNIC ([\d-]+) · (\d+) ·$/, (_, c, m) => `شناختی کارڈ ${c} · ${m} ·`],
  [/^(.+) \(from your message\)$/, (_, v) => `${t(v)} (آپ کے پیغام سے)`],
  [/^(.+) › (.+)$/, (_, a, b) => `${t(a)} › ${t(b)}`],
  [/^Complaint (\w+)$/, (_, r) => `شکایت ${r}`],
  [/^Complaint (\w+) · you are following this$/, (_, r) => `شکایت ${r} · آپ اسے فالو کر رہے ہیں`],
  [/^(.+) · (Resident Portal|Incoming Call|Android|iOS|Walk In)$/, (_, d, s) => `${dates(d)} · ${{ 'Resident Portal': 'رہائشی پورٹل', 'Incoming Call': 'فون کال', 'Walk In': 'دفتر آ کر' }[s] || s}`],
  [/^(.+?) — (.+)$/, (_, d, n) => `${dates(d)} — ${t(n)}`],
  [/^Assigned to the (.+) team\.$/, (_, x) => `${t(x)} ٹیم کے حوالے کی گئی۔`],
  [/^(.+) team$/, (_, x) => `${t(x)} ٹیم`],
  [/^(.+): (complaint registered|team assigned|marked resolved|closed|on hold|reopened|cancelled|team could not get in)( \(a complaint you follow\))?$/, (_, s, what, f) =>
    `${t(s)}: ${{ 'complaint registered': 'شکایت درج ہو گئی', 'team assigned': 'ٹیم مقرر ہو گئی', 'marked resolved': 'حل ہو گئی', closed: 'بند ہو گئی', 'on hold': 'روک دی گئی', reopened: 'دوبارہ کھل گئی', cancelled: 'منسوخ ہو گئی', 'team could not get in': 'ٹیم اندر نہیں جا سکی' }[what]}${f ? ' (جسے آپ فالو کر رہے ہیں)' : ''}`],
  [/^Reference (\w+)\. We will tell you when the team picks it up\.$/, (_, r) => `حوالہ ${r}۔ ٹیم کے کام شروع کرنے پر ہم آپ کو بتائیں گے۔`],
  [/^(Rs [\d,]+) received\. Reference (\w+)\.$/, (_, a, r) => `${a} موصول ہو گئے۔ حوالہ ${r}۔`],
  [/^· (.+)$/, (_, d) => `· ${dates(d)}`],
  [/^Membership ([\w-]+)$/, (_, m) => `ممبرشپ ${m}`],
  [/^(.+) (Residential|Commercial) plot$/, (_, s, c) => `${addr(s)} ${ADDR_WORDS[c]} پلاٹ`],
  [/^(Owner|Allottee|Joint owner) since (.+)$/, (_, o, d) => `${t(o)}، ${dates(d)} سے`],
  [/^(\d+) installments? overdue: (Rs [\d,]+)\.$/, (_, n, a) => `${n} اقساط واجب الادا ہیں: ${a}۔`],
  [/^Please pay, or contact Finance on ([\d-]+)\.$/, (_, p) => `براہ کرم ادائیگی کریں، یا فنانس سے ${p} پر رابطہ کریں۔`],
  [/^(Rs [\d,]+) of (Rs [\d,]+) \((\d+)%\)$/, (_, a, b, p) => `${b} میں سے ${a} (${p}%)`],
  [/^(Rs [\d,]+) on (.+)$/, (_, a, d) => `${a}، ${dates(d)} کو`],
  [/^(\d+) installments?$/, (_, n) => `${n} اقساط`],
  [/^See the full schedule \((\d+) payments\)$/, (_, n) => `مکمل شیڈول دیکھیں (${n} ادائیگیاں)`],
  [/^Installment (\d+) of (\d+)$/, (_, a, b) => `قسط ${a} از ${b}`],
  [/^Paid (.+)$/, (_, d) => `ادا شدہ ${dates(d)}`],
  [/^Consumer ID ([\w-]+)$/, (_, c) => `کنزیومر آئی ڈی ${c}`],
  [/^Society bills: (.+)$/, (_, a) => `سوسائٹی بل: ${addr(a)}`],
  [/^(Rs [\d,]+) to pay$/, (_, a) => `${a} ادا کرنے ہیں`],
  [/^Pay (Rs [\d,]+) \(demo payment\)$/, (_, a) => `${a} ادا کریں (ڈیمو ادائیگی)`],
  [/^Building: (\d+) of (\d+) steps done$/, (_, a, b) => `تعمیر: ${b} میں سے ${a} مراحل مکمل`],
  [/^Next: (.+?)\.?$/, (_, x) => `اگلا مرحلہ: ${t(x)}`],
  [/^See the steps, limits and fees for this plot\.$/, () => 'اس پلاٹ کے مراحل، حدیں اور فیس دیکھیں۔'],
  [/^(Site plan and possession|Building plan approval): (.+)\.$/, (_, a, b) => `${t(a)}: ${t(b)}۔`],
  [/^Fee voucher (Rs [\d,]+), (overdue|due (.+))\.$/, (_, a, o, d) => `فیس ووچر ${a}، ${o === 'overdue' ? 'تاخیر شدہ' : `آخری تاریخ ${dates(d)}`}۔`],
  [/^Fee voucher: (Rs [\d,]+), (?:due by (.+)|overdue since (.+))$/, (_, a, d, o) => `فیس ووچر: ${a}، ${d ? `آخری تاریخ ${dates(d)}` : `${dates(o)} سے تاخیر شدہ`}`],
  [/^(.+) · (Building Control|Town Planning) · application (\S+)$/, (_, a, o, c) => `${t(a)} · ${t(o)} · درخواست ${c}`],
  [/^since (.+)$/, (_, d) => `${dates(d)} سے`],
  [/^✓ (.+)$/, (_, x) => `✓ ${t(x)}`],
  [/^This step usually takes (?:about )?(less than a day|(\d+) days?)\.$/, (_, x, n) => `اس مرحلے میں عموماً ${n ? `تقریباً ${n} دن` : 'ایک دن سے کم'} لگتے ہیں۔`],
  [/^What the voucher is for \((\d+) charges\)$/, (_, n) => `ووچر کس چیز کا ہے (${n} مدات)`],
  [/^History \((\d+) updates?\)$/, (_, n) => `تاریخچہ (${n} اپ ڈیٹس)`],
  [/^Paid vouchers \((\d+)\)$/, (_, n) => `ادا شدہ ووچر (${n})`],
  [/^(.+) phone numbers$/, (_, o) => `${t(o)} کے فون نمبر`],
  [/^What you can build on a (.+) plot$/, (_, s) => `${addr(s)} کے پلاٹ پر کیا بنا سکتے ہیں`],
  [/^Up to (\d+)% of the plot: about ([\d,]+) sq ft, car porch included$/, (_, p, f) => `پلاٹ کا زیادہ سے زیادہ ${p}%: تقریباً ${f} مربع فٹ، کار پورچ سمیت`],
  [/^Back (.+) · porch side (.+) · other side (.+)$/, (_, a, b, c) => `پیچھے ${a} · پورچ کی طرف ${b} · دوسری طرف ${c}`],
  [/^(\d+) storeys, at most (.+) including the water tank and mumty$/, (_, n, h) => `${n} منزلیں، پانی کی ٹینکی اور ممٹی سمیت زیادہ سے زیادہ ${h}`],
  [/^Rooms at least (.+) · (\d+) fire extinguishers$/, (_, r, n) => `کمرے کم از کم ${r} · ${n} آگ بجھانے والے آلات`],
  [/^(\d+) of (\d+) done$/, (_, a, b) => `${b} میں سے ${a} مکمل`],
  [/^DHA Byelaws clause ([\d.]+) and 8\.54 general rules\. Your architect works these into the drawings\.$/, (_, c) => `ڈی ایچ اے بائی لاز شق ${c} اور 8.54 کے عمومی قواعد۔ آپ کا آرکیٹیکٹ انہیں نقشوں میں شامل کرتا ہے۔`],
  [/^(\d+) plots for sale by DHA\. Book with a token, then pay the down payment to get the allotment\.$/, (_, n) => `ڈی ایچ اے کے ${n} پلاٹ برائے فروخت۔ ٹوکن دے کر بک کریں، پھر الاٹمنٹ کے لیے ڈاؤن پیمنٹ ادا کریں۔`],
  [/^Up to Rs ([\d.]+) million$/, (_, n) => `${n} ملین روپے تک`],
  [/^Rs ([\d.]+) million$/, (_, n) => `${n} ملین روپے`],
  [/^Phase ([IVX]+)$/, (_, r) => `فیز ${r}`],
  [/^Phase ([IVX]+) · Sector (.+)$/, (_, r, s) => `فیز ${r} · سیکٹر ${s}`],
  [/^Showing (\d+) of (\d+)$/, (_, a, b) => `${b} میں سے ${a} دکھائے جا رہے ہیں`],
  [/^(.+) (residential|commercial) plot$/, (_, s, c) => `${addr(s)} ${ADDR_WORDS[c]} پلاٹ`],
  [/^Plot (\w+), Street (\w+) · (\d+) sq yd · token (Rs [\d,]+)$/, (_, p, s, y, tk) => `پلاٹ ${p}، گلی ${s} · ${y} مربع گز · ٹوکن ${tk}`],
  [/^Book with (Rs [\d,]+) token \(demo payment\)$/, (_, a) => `${a} ٹوکن کے ساتھ بک کریں (ڈیمو ادائیگی)`],
  [/^Live AI · (.+)$/, (_, p) => `لائیو AI · ${p}`],
  [/^Checked (\d+) sources?( · live AI)?$/, (_, n, l) => `${n} ذرائع دیکھے${l ? ' · لائیو AI' : ''}`],
  [/^(\d+) (steps|documents|forms|fees)$/, (_, n, w) => `${n} ${{ steps: 'مراحل', documents: 'کاغذات', forms: 'فارم', fees: 'فیسیں' }[w]}`],
  [/^…and (\d+) more steps$/, (_, n) => `…اور ${n} مزید مراحل`],
  [/^(.+): (bills|dues)$/, (_, n, w) => `${n}: ${w === 'bills' ? 'بل' : 'واجبات'}`],
  [/^Read (.+)'s account from the member and resident portals$/, (_, n) => `${n} کا اکاؤنٹ ممبر اور رہائشی پورٹل سے دیکھا`],
  [/^Checked the complaint system: (\d+) complaints? on your CNIC$/, (_, n) => `شکایات کا نظام دیکھا: آپ کے شناختی کارڈ پر ${n} شکایات`],
  [/^Checked the membership portal: (\d+) applications? on your plots$/, (_, n) => `ممبرشپ پورٹل دیکھا: آپ کے پلاٹوں پر ${n} درخواستیں`],
  [/^Understood: (a request for|a problem with) (.+) \((\d+)% sure\)$/, (_, k, x, p) => `سمجھ گیا: ${t(x)} ${k === 'a request for' ? 'کی درخواست' : 'کا مسئلہ'} (${p}% یقین)`],
  [/^(.+) complaint$/, (_, x) => `${t(x)} کی شکایت`],
  // Home "For you" cards
  [/^(\d+) instalments? overdue on plot (\w+)$/, (_, n, p) => `پلاٹ ${p} کی ${n} اقساط واجب الادا ہیں`],
  [/^Next instalment: (Rs [\d,]+) on (.+)$/, (_, a, d) => `اگلی قسط: ${a}، ${dates(d)} کو`],
  [/^Society bill: (Rs [\d,]+) to pay by (.+)$/, (_, a, d) => `سوسائٹی بل: ${a}، ${dates(d)} تک ادا کریں`],
  [/^Fee voucher to pay: (Rs [\d,]+), by (.+)$/, (_, a, d) => `فیس ووچر: ${a}، ${dates(d)} تک ادا کریں`],
  [/^Is the (.+) fixed\? The team says it is done\.$/, (_, x) => `کیا ${t(x)} کی شکایت حل ہو گئی؟ ٹیم کے مطابق کام مکمل ہے۔`],
  [/^(\d+) open complaints?: (.+)$/, (_, n, l) => `${n} کھلی شکایات: ${l.split(', ').map(t).join('، ')}`],
  [/^Plot booking: pay (Rs [\d,]+) by (.+)$/, (_, a, d) => `پلاٹ کی بکنگ: ${dates(d)} تک ${a} ادا کریں`],
  [/^(\d+) DHA plots for sale, with payment plans$/, (_, n) => `ڈی ایچ اے کے ${n} پلاٹ برائے فروخت، اقساط کے ساتھ`],
  [/^Building (.+): (\d+) of (\d+) steps done$/, (_, p, a, b) => `${addr(p)} کی تعمیر: ${b} میں سے ${a} مراحل مکمل`],
  [/^Paid: (Rs [\d,]+), reference (\w+), by (.+)\.$/, (_, a, r, c) => `ادا ہو گئے: ${a}، حوالہ ${r}، بذریعہ ${t(c)}۔`],
];

// ---------- Messages from the reporter and the assistant (markdown) ----------

const M = [
  [/^Assalam-o-Alaikum (.+)\. What is the problem\? Tell me in your own words, in English or Urdu\.$/, (_, n) => `السلام علیکم ${n}۔ کیا مسئلہ ہے؟ اپنے الفاظ میں بتائیں، انگریزی یا اردو میں۔`],
  [/^I understand: \*\*(.+)\*\*\.$/, (_, x) => `میں سمجھ گیا: **${t(x)}**۔`],
  [/^This sounds urgent: \*\*(.+)\*\*\. I will mark it as urgent\.$/, (_, x) => `یہ فوری معاملہ لگتا ہے: **${t(x)}**۔ میں اسے فوری کے طور پر درج کروں گا۔`],
  [/^Please check the details\. I will send this to the DHA complaint system\.$/, () => 'براہ کرم تفصیل چیک کر لیں۔ میں یہ ڈی ایچ اے کے شکایات کے نظام کو بھیج دوں گا۔'],
  [/^\*\*If you smell gas:\*\* do not switch any light or fan on or off, do not light a flame, open the doors and windows, and take everyone outside\.$/, () => '**اگر گیس کی بو آ رہی ہو:** کوئی لائٹ یا پنکھا آن یا آف نہ کریں، آگ نہ جلائیں، دروازے اور کھڑکیاں کھول دیں، اور سب کو باہر لے جائیں۔'],
  [/^Call the Sui gas emergency line \*\*1199\*\* \(SNGPL, national\)\.$/, () => 'سوئی گیس کی ایمرجنسی لائن **1199** (SNGPL) پر کال کریں۔'],
  [/^Security control room for your phase \(24\/7\): \*\*(.+)\*\*\.$/, (_, n) => `آپ کے فیز کا سیکیورٹی کنٹرول روم (24 گھنٹے): **${n}**۔`],
  [/^\*\*Keep everyone away from the wires\.\*\* If it is safe, switch off the main breaker\. Do not touch anything that is sparking, and do not use water on it\.$/, () => '**سب کو تاروں سے دور رکھیں۔** اگر محفوظ ہو تو مین بریکر بند کر دیں۔ چنگاری والی کسی چیز کو ہاتھ نہ لگائیں، اور اس پر پانی نہ ڈالیں۔'],
  [/^\*\*Keep children and others away from the spot\*\* until the team arrives\.$/, () => '**ٹیم کے آنے تک بچوں اور دوسروں کو اس جگہ سے دور رکھیں۔**'],
  [/^If there is a fire, call DHA Fire Fighting \*\*(.+)\*\* or Rescue \*\*1122\*\* now\.$/, (_, n) => `اگر آگ لگی ہو تو فوراً ڈی ایچ اے فائر فائٹنگ **${n}** یا ریسکیو **1122** پر کال کریں۔`],
  [/^Someone on your street \(Street (\w+), Sector (\w+)\) already reported \*\*(.+)\*\* at (.+)\. It is \*\*(.+)\*\*, so the team already knows\.$/, (_, st, se, x, at, s) =>
    `آپ کی گلی (گلی ${st}، سیکٹر ${se}) سے کوئی پہلے ہی ${dates(at)} کو **${t(x)}** کی شکایت درج کرا چکا ہے۔ اس کی حیثیت **${t(s)}** ہے، یعنی ٹیم کو پہلے سے علم ہے۔`],
  [/^You are now following complaint \*\*(\w+)\*\*\. You will get its updates, just like the person who reported it\. No new complaint was needed\.$/, (_, r) =>
    `اب آپ شکایت **${r}** کو فالو کر رہے ہیں۔ آپ کو اس کی اپ ڈیٹس ملیں گی، جیسے شکایت کرنے والے کو۔ نئی شکایت کی ضرورت نہیں پڑی۔`],
  [/^You already have an open (.+) complaint, \*\*(\w+)\*\*, made (.+)\. It is \*\*(.+)\*\*\.$/, (_, x, r, at, s) => `آپ کی ${t(x)} کی ایک شکایت **${r}** پہلے سے کھلی ہے، جو ${dates(at)} کو درج ہوئی۔ اس کی حیثیت **${t(s)}** ہے۔`],
  [/^Done\. I added your message to complaint \*\*(\w+)\*\*, so the same team sees it\. You will get a notification when its status changes\.$/, (_, r) => `ہو گیا۔ میں نے آپ کا پیغام شکایت **${r}** میں شامل کر دیا ہے، تاکہ وہی ٹیم اسے دیکھے۔ حیثیت بدلنے پر آپ کو اطلاع ملے گی۔`],
  [/^Your complaint is registered\. Reference \*\*(\w+)\*\*\.(?: Most (.+) complaints are resolved within about \*\*(\d+) (hours|days)\*\*\.)? You will get a notification here at every update\.$/, (_, r, x, n, u) =>
    `آپ کی شکایت درج ہو گئی ہے۔ حوالہ نمبر **${r}**۔${x ? ` ${t(x)} کی زیادہ تر شکایات تقریباً **${n} ${u === 'hours' ? 'گھنٹوں' : 'دنوں'}** میں حل ہو جاتی ہیں۔` : ''} ہر اپ ڈیٹ پر آپ کو یہاں اطلاع ملے گی۔`],
  [/^No problem, nothing was sent\.$/, () => 'کوئی بات نہیں، کچھ نہیں بھیجا گیا۔'],
  [/^Added to the details\.$/, () => 'تفصیل میں شامل کر دیا۔'],
  [/^I did not quite follow\. Which of these is closest\? Or tell me a bit more, for example "street light is off" or "geyser not working"\.$/, () => 'میں ٹھیک سے نہیں سمجھ سکا۔ ان میں سے کون سا قریب ترین ہے؟ یا تھوڑا اور بتائیں، مثلاً "اسٹریٹ لائٹ بند ہے" یا "گیزر کام نہیں کر رہا"۔'],
  [/^Which of these is it\?$/, () => 'ان میں سے کون سا ہے؟'],
  [/^Is it this\?$/, () => 'کیا یہ ہے؟'],
  [/^Here are all the common types\. Pick the closest one, or describe the problem again in more detail\.$/, () => 'یہ تمام عام اقسام ہیں۔ قریب ترین منتخب کریں، یا مسئلہ دوبارہ مزید تفصیل سے بتائیں۔'],
  [/^Complaints are made for a DHA house or plot, and (.+) has none registered yet\. Once you own or live in a property in DHA, you can report problems here\.$/, (_, n) =>
    `شکایت ڈی ایچ اے کے کسی گھر یا پلاٹ کے لیے درج ہوتی ہے، اور ${n} کے نام ابھی کوئی جائیداد رجسٹر نہیں۔ ڈی ایچ اے میں جائیداد کے مالک یا رہائشی بننے کے بعد آپ یہاں مسائل درج کرا سکیں گے۔`],
  [/^For anything else, the DHA helpline is \*\*(.+)\*\*\.$/, (_, n) => `کسی اور کام کے لیے ڈی ایچ اے ہیلپ لائن **${n}** ہے۔`],
  [/^I have passed this conversation to the Complaint Office \(request \*\*(.+)\*\*\), so you will not need to explain it again\. They will call you on \*\*(.+)\*\*\.$/, (_, h, m) =>
    `میں نے یہ گفتگو شکایت دفتر کو بھیج دی ہے (درخواست **${h}**)، تاکہ آپ کو دوبارہ بتانا نہ پڑے۔ وہ آپ کو **${m}** پر کال کریں گے۔`],
  [/^If it is urgent, call \*\*1092\*\* now\.$/, () => 'اگر فوری ہو تو ابھی **1092** پر کال کریں۔'],
  [/^Here are your latest bills for consumer ID \*\*(.+)\*\* \(demo figures\):$/, (_, c) => `کنزیومر آئی ڈی **${c}** کے تازہ بل (ڈیمو رقوم):`],
  [/^Glad that helped\. Your bills and payment history are always in \*\*My account\*\*\.$/, () => 'خوشی ہوئی کہ مدد ہو گئی۔ آپ کے بل اور ادائیگیوں کا ریکارڈ ہمیشہ **میرا اکاؤنٹ** میں موجود ہے۔'],
  [/^You ordered a water tanker on (.+) \(\*\*(\w+)\*\*, (.+)\)\. DHA allows one tanker every 48 hours, so the next one can be ordered after \*\*(.+)\*\*\.$/, (_, at, r, s, n) =>
    `آپ نے ${dates(at)} کو پانی کا ٹینکر منگوایا تھا (**${r}**، ${t(s)})۔ ڈی ایچ اے 48 گھنٹے میں ایک ٹینکر دیتا ہے، اس لیے اگلا ٹینکر **${dates(n)}** کے بعد منگوایا جا سکتا ہے۔`],
  [/^Because it is happening now, please also call the \*\*security control room for your phase: (.+)\*\* \(24\/7\)\.$/, (_, n) => `چونکہ یہ ابھی ہو رہا ہے، براہ کرم اپنے فیز کے **سیکیورٹی کنٹرول روم: ${n}** (24 گھنٹے) پر بھی کال کریں۔`],
  // The assistant's answers from the portals (core/intent.js)
  [/^Sure, I can arrange a \*\*(.+)\*\* for you\.( It is a paid service; the reporter shows how to pay\.)?$/, (_, x, paid) => `ضرور، میں آپ کے لیے **${t(x)}** کا انتظام کر سکتا ہوں۔${paid ? ' یہ ادا شدہ سروس ہے؛ اگلا قدم ادائیگی کا طریقہ بتائے گا۔' : ''}`],
  [/^Press \*\*Continue\*\* below\. Your address and mobile come from your profile, so I will only ask what is missing \(for example a time\), then show a summary for you to confirm before it goes to the complaint system\.$/, () =>
    'نیچے **جاری رکھیں** دبائیں۔ آپ کا پتہ اور موبائل نمبر آپ کی پروفائل سے لیا جائے گا، اس لیے میں صرف وہی پوچھوں گا جو باقی ہے (مثلاً وقت)، پھر شکایات کے نظام کو بھیجنے سے پہلے خلاصہ دکھاؤں گا تاکہ آپ تصدیق کر لیں۔'],
  [/^Press \*\*Continue\*\* below\. Your address and mobile come from your profile, so I will only ask what is missing, then show a summary for you to confirm\.$/, () =>
    'نیچے **جاری رکھیں** دبائیں۔ آپ کا پتہ اور موبائل نمبر آپ کی پروفائل سے لیا جائے گا، اس لیے میں صرف وہی پوچھوں گا جو باقی ہے، پھر تصدیق کے لیے خلاصہ دکھاؤں گا۔'],
  [/^Press \*\*Continue\*\* below\. After you sign in, your address and mobile come from your profile, and I will only ask what is missing.*$/, () =>
    'نیچے **جاری رکھیں** دبائیں۔ سائن اِن کے بعد آپ کا پتہ اور موبائل نمبر آپ کی پروفائل سے لیا جائے گا، اور میں صرف وہی پوچھوں گا جو باقی ہے، پھر تصدیق کے لیے خلاصہ دکھاؤں گا۔'],
  [/^I'm sorry about this\. This looks like a \*\*(.+)\*\* problem\.$/, (_, x) => `اس تکلیف پر معذرت۔ یہ **${t(x)}** کا مسئلہ لگتا ہے۔`],
  [/^(.+), here is what I found:$/, (_, n) => `${n}، یہ رہی آپ کے اکاؤنٹ کی معلومات:`],
  [/^(.+), here is where your applications are:$/, (_, n) => `${n}، آپ کی درخواستیں اس مرحلے پر ہیں:`],
  [/^\*\*(.+)\*\* \(([\w-]+)\): \*\*(\d+) instalments? overdue, (Rs [\d,]+)\*\* in total, the oldest due on (.+?)\.(?: Next: (.+), (Rs [\d,]+) on (.+)\.)?$/, (_, p, m, n, a, d, nl, na, nd) =>
    `**${addr(p)}** (${m}): **${n} اقساط واجب الادا، کل ${a}**، سب سے پرانی کی آخری تاریخ ${dates(d)} تھی۔${nl ? ` اگلی: ${t(nl)}، ${na}، ${dates(nd)} کو۔` : ''}`],
  [/^\*\*(.+)\*\* \(([\w-]+)\): nothing overdue\. Next: (.+), \*\*(Rs [\d,]+)\*\* on (.+)\.$/, (_, p, m, l, a, d) => `**${addr(p)}** (${m}): کچھ واجب الادا نہیں۔ اگلی: ${t(l)}، **${a}**، ${dates(d)} کو۔`],
  [/^\*\*(.+)\*\* \(([\w-]+)\): fully paid\. No instalments are due\.$/, (_, p, m) => `**${addr(p)}** (${m}): مکمل ادا۔ کوئی قسط واجب نہیں۔`],
  [/^\*\*Society bill\*\* for (.+): \*\*(Rs [\d,]+) unpaid\*\* \((.+)\)\.$/, (_, p, a, d) => `**سوسائٹی بل** برائے ${addr(p)}: **${a} ادا کرنے ہیں** (${dates(d).replace(/overdue since/g, 'تاخیر شدہ از').replace(/due by/g, 'آخری تاریخ')})۔`],
  [/^\*\*Society bill\*\* for (.+): all paid(?: \(last paid (.+)\))?\.$/, (_, p, d) => `**سوسائٹی بل** برائے ${addr(p)}: سب ادا${d ? ` (آخری ادائیگی ${dates(d)})` : ''}۔`],
  [/^\*\*You can pay this bill here in the app\.\*\* Press \*\*Pay this bill\*\* below \(demo payment\)\.$/, () => '**آپ یہ بل یہیں ایپ میں ادا کر سکتے ہیں۔** نیچے **یہ بل ادا کریں** دبائیں (ڈیمو ادائیگی)۔'],
  [/^The full schedule and payment history are in \*\*My account\*\*\.$/, () => 'مکمل شیڈول اور ادائیگیوں کا ریکارڈ **میرا اکاؤنٹ** میں ہے۔'],
  [/^The steps and vouchers are on \*\*Build a house\*\*\.$/, () => 'مراحل اور ووچر **گھر بنائیں** میں ہیں۔'],
  [/^\*\*How to pay:\*\* at any (.+) branch by (.+?)( \(please confirm with DHA\))?\.(.*)$/, (_, b, modes, c, rest) =>
    `**ادائیگی کا طریقہ:** ${b} کی کسی بھی برانچ میں ${modes.replace(/pay-in slip/g, 'پے اِن سلپ').replace(/pay order/g, 'پے آرڈر').replace(/bank draft/g, 'بینک ڈرافٹ').replace(/ or /g, ' یا ').replace(/, /g, '، ')} کے ذریعے${c ? ' (ڈی ایچ اے سے تصدیق کریں)' : ''}۔${rest
      .replace(' Cash and cheques are not accepted, and neither is a pay order from a bank outside the city.', ' نقد اور چیک قبول نہیں، نہ ہی شہر سے باہر کے بینک کا پے آرڈر۔')
      .replace(" DHA has not yet published the details for paying online; the Finance Directorate can tell you.", ' آن لائن ادائیگی کی تفصیل ڈی ایچ اے نے ابھی شائع نہیں کی؛ فنانس ڈائریکٹوریٹ بتا سکتا ہے۔')}`],
  [/^\*\*Open \((\d+)\):\*\*$/, (_, n) => `**کھلی (${n}):**`],
  [/^\*\*(\w+)\*\* · (.+): \*\*(.+)\*\*( \(a complaint you follow\))?$/, (_, r, x, s, f) => `**${r}** · ${t(x)}: **${t(s)}**${f ? ' (جسے آپ فالو کر رہے ہیں)' : ''}`],
  [/^\*\*Waiting for your answer:\*\* the team says (?:this is|these are) fixed\. Please tell us if (?:it is|they are)\.$/, () => '**آپ کے جواب کا انتظار ہے:** ٹیم کے مطابق مسئلہ حل ہو گیا ہے۔ براہ کرم بتائیں کیا واقعی ایسا ہے۔'],
  [/^You have no complaints with DHA\. If something needs fixing, tell me what it is and I will start one\.$/, () => 'ڈی ایچ اے میں آپ کی کوئی شکایت نہیں۔ اگر کچھ ٹھیک کروانا ہو تو بتائیں، میں شکایت شروع کر دوں گا۔'],
  [/^Your (bills|dues) are personal, so I need to know who you are first\. Please \*\*sign in\*\*.*$/, () => 'یہ آپ کی ذاتی معلومات ہیں، اس لیے پہلے مجھے جاننا ہے کہ آپ کون ہیں۔ براہ کرم **سائن اِن** کریں، پھر دوبارہ پوچھیں۔'],
];

const cache = new Map();

export function t(s) {
  if (lang !== 'ur' || s == null) return s;
  const key = String(s);
  if (cache.has(key)) return cache.get(key);
  let out = EXACT[key] ?? LOWER.get(key.toLowerCase());
  if (out == null) {
    for (const [rx, fn] of P) {
      const m = key.match(rx);
      if (m) { out = fn(...m); break; }
    }
  }
  if (out == null && ADDR_RX.test(key) && /House|Plot|Street|Sector|Phase|Marla|Kanal/.test(key)) out = addr(key);
  out ??= key;
  if (cache.size > 3000) cache.clear();
  cache.set(key, out);
  return out;
}

// A message in markdown: each paragraph or list item on its own, keeping "- " and indentation.
export function trMsg(text) {
  if (lang !== 'ur' || !text) return text;
  return String(text).split('\n').map(line => {
    const [, lead, body] = line.match(/^(\s*(?:[-*•]\s+|\d+[.)]\s+)?)(.*)$/);
    if (!body.trim()) return line;
    for (const [rx, fn] of M) {
      const m = body.match(rx);
      if (m) return lead + fn(...m);
    }
    const plain = t(body);
    return lead + plain;
  }).join('\n');
}

// True when nothing in the message was translated: DHA's own content, shown with a note in Urdu mode.
export const stillEnglish = text => lang === 'ur' && !!text && !hasUrdu(trMsg(text));

// ---------- The page ----------

const SKIP = 'script, style, textarea, code, [data-no-tr], .msg-user, .p-quote';
const ATTRS = ['placeholder', 'aria-label', 'title'];

function trText(node) {
  const raw = node.nodeValue;
  const s = raw.trim();
  if (!s || !/[A-Za-z]/.test(s) || node.parentElement?.closest(SKIP)) return;
  const out = t(s);
  if (out !== s) node.nodeValue = raw.replace(s, out);
}

function trTree(root) {
  if (root.nodeType === Node.TEXT_NODE) return trText(root);
  if (root.nodeType !== Node.ELEMENT_NODE || root.closest(SKIP)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) trText(n);
  for (const el of [root, ...root.querySelectorAll('[placeholder], [aria-label], [title]')]) {
    if (el.closest(SKIP) && !el.matches('textarea')) continue;
    for (const a of ATTRS) { const v = el.getAttribute?.(a); if (v && /[A-Za-z]/.test(v)) { const out = t(v); if (out !== v) el.setAttribute(a, out); } }
  }
}

// Call once at start. Switching language reloads the page, so English never has to be restored.
export function start() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr';
  if (lang !== 'ur') return;
  trTree(document.body);
  new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) trTree(n);
  }).observe(document.body, { childList: true, subtree: true });
}
