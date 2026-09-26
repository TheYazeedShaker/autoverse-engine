// One 404 for every "no": unknown host, flag off, dormant market. It names no brand, so a caller
// can't probe which brands or markets exist (spec §2).
export default function NotFound() {
  return (
    <main>
      <h1>Page not found</h1>
      <p lang="ar" dir="rtl">
        الصفحة غير موجودة
      </p>
    </main>
  );
}
