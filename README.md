# palentweb · حلول التجارة الإلكترونية

موقع palentweb بالعربية والإنجليزية: خدمات تصميم المتاجر، Shopify، بوابات الدفع، السوشيال ميديا، الإعلانات، تطبيقات الجوال، تصميم الشعارات، نماذج المتاجر، وحجز الاستشارة.

## نشر الموقع على GitHub Pages
1. افتح المستودع على GitHub ← **Settings** ← **Pages**.
2. في **Source** اختر **Deploy from a branch**، ثم الفرع `main` والمجلد `/ (root)`، واضغط **Save**.
3. بعد دقيقة يظهر رابط الموقع، مثل: `https://zolzoX.github.io/palentweb/`.
4. لربط دومين خاص (مثل palentweb.com): أضفه في نفس الصفحة تحت **Custom domain**، ثم أضف سجل CNAME عند شركة الدومين.

## الشات والإحصائيات على الموقع المنشور
لوحة التحكم والشات المباشر المدمجان يعملان داخل نسخة Claude فقط. على GitHub Pages:
- افتح `index.html` وابحث عن `SITE_CONFIG`.
- ضع رقم موقعك من **Tawk.to** في `tawkPropertyId` لتفعيل الشات المباشر (مجاني، وتصلك الرسائل على تطبيق Tawk).
- ضع رقم **Google Analytics** (يبدأ بـ `G-`) في `gaMeasurementId` لمعرفة عدد الزوار وبلدانهم وأجهزتهم.

---

# palentweb · E-commerce solutions

Bilingual (Arabic/English) agency site. To publish: **Settings → Pages → Deploy from a branch → main / root**.
The built-in admin panel and live chat run inside the Claude version only; on GitHub Pages, set `tawkPropertyId` (Tawk.to live chat) and `gaMeasurementId` (Google Analytics) in `SITE_CONFIG` inside `index.html`.
