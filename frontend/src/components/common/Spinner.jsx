// Small loading spinner; `light` for use on coloured buttons
export default function Spinner({ size = 16, light = false, style }) {
  const colours = light ? { borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' } : {};
  return <div className="spinner" style={{ width: size, height: size, ...colours, ...style }} />;
}
