import Icon from '../../components/common/Icon.jsx';

// Labelled text input with an icon on the left
export default function IconInput({ label, icon, ...inputProps }) {
  return (
    <div className="form-field">
      <label className="form-label">{label}</label>
      <div className="input-with-icon">
        <span className="input-icon">
          <Icon name={icon} size={18} />
        </span>
        <input className="form-control has-icon" {...inputProps} />
      </div>
    </div>
  );
}
