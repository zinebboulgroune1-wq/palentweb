# palentweb · حلول التجارة الإلكترونية

موقع palentweb بالعربية والإنجليزية، مع لوحة تحكم تعمل عبر Firebase: الزوار (البلد والساعة والجهاز)، وطلبات التواصل، وحجوزات الاستشارة.

## الملفات
| الملف | الوظيفة |
|---|---|
| `index.html` | الموقع كاملاً |
| `firebase-config.js` | تضع فيه بيانات مشروع Firebase وبريد المدير |
| `firebase-shim.js` | يربط الموقع ولوحة التحكم بـFirebase (لا تعدّله) |
| `firestore.rules` | قواعد الحماية: لا يقرأ البيانات إلا المدير |

## 1) نشر الموقع على GitHub Pages
1. ارفع الملفات الخمسة إلى مستودع `palentweb`.
2. **Settings ← Pages ← Deploy from a branch**، اختر `main` و `/ (root)` ثم **Save**.
3. بعد دقيقة يعمل الموقع على `https://zolzoX.github.io/palentweb/`.

## 2) تشغيل لوحة التحكم بـFirebase (مجاني، نحو ١٠ دقائق)
1. ادخل **console.firebase.google.com** ← **Add project**، سمّه `palentweb`، وأكمل الخطوات.
2. **Build ← Authentication ← Get started**، ثم من تبويب **Sign-in method** فعّل:
   - **Email/Password**
   - **Anonymous** (لتسجيل الزوار بدون حساب)
3. في تبويب **Users** اضغط **Add user**: اكتب `palentweb@gmail.com` وكلمة مرور قوية. هذا حساب المدير.
4. في تبويب **Settings ← Authorized domains** أضف: `zolzoX.github.io` (ودومينك الخاص إن ربطته).
5. **Build ← Firestore Database ← Create database**، اختر أقرب موقع لك، ثم **Production mode**.
6. في تبويب **Rules** احذف الموجود، والصق محتوى ملف `firestore.rules`، ثم **Publish**.
7. **Project settings** (أيقونة الترس) ← **Your apps** ← أيقونة الويب `</>` ← سمّ التطبيق ← **Register app**.
   انسخ القيم الظاهرة (apiKey و authDomain و projectId و storageBucket و messagingSenderId و appId) إلى ملف `firebase-config.js`.
8. ارفع `firebase-config.js` المعدّل إلى GitHub مكان القديم.

## 3) فتح لوحة التحكم
افتح `https://zolzoX.github.io/palentweb/#admin` وادخل بالبريد وكلمة المرور من الخطوة 3.
بعد الدخول يظهر زر «لوحة التحكم» في أعلى الموقع، وزر «تسجيل الخروج» داخل اللوحة.
لتغيير كلمة المرور: Firebase ← Authentication ← Users.

> بيانات `firebase-config.js` ليست سرية، فهي مصممة لتكون ظاهرة في المواقع. الحماية الحقيقية في قواعد `firestore.rules`.
> إذا تركت `apiKey` فارغاً يعمل الموقع عادياً بدون لوحة التحكم، وزر واتساب يعمل دائماً.

---

# palentweb · E-commerce solutions (English)
1. Upload the five files and enable **Settings → Pages → main / root**.
2. In Firebase: enable **Email/Password** and **Anonymous** sign-in, add the admin user `palentweb@gmail.com`, add `zolzoX.github.io` to **Authorized domains**, create **Firestore** (production) and paste `firestore.rules`, register a **Web app** and copy its config into `firebase-config.js`.
3. Open `/#admin` and log in with the admin account.
