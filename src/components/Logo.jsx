/**
 * Logo — компонент логотипа Karta-AD
 * Использует реальный файл Logo.Karta-AD.png
 *
 * Варианты size:
 *   "sm"  — только иконка 36px (квадратная обрезка)
 *   "md"  — стандартный размер 120px ширина
 *   "lg"  — большой 200px ширина
 *   "full"— полный размер, занимает всю ширину контейнера
 */
export default function Logo({ size = 'md', className = '' }) {
  const widths = {
    sm: 36,
    md: 120,
    lg: 200,
    full: '100%',
  };

  const width = widths[size] || 120;

  return (
    <img
      src="/logo.png"
      alt="Karta-AD"
      width={width}
      style={{
        width,
        height: 'auto',
        objectFit: 'contain',
        display: 'block',
        flexShrink: 0,
      }}
      className={className}
    />
  );
}
