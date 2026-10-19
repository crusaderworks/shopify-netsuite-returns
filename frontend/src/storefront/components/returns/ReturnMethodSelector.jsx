import { EmailIcon, WebsiteIcon } from '../../../components/icons/AppIcons'

export default function ReturnMethodSelector({ method, onChange, disabled }) {
  const options = [
    { value: 'website', title: 'Through Website', description: 'Orders placed on our online store', Icon: WebsiteIcon },
    { value: 'assisted', title: 'Through Call or Email', description: 'Orders placed with our sales or support team', Icon: EmailIcon },
  ]
  return <div className="return-methods" role="group" aria-label="Return method">
    {options.map(({ value, title, description, Icon }) => <button key={value} type="button" aria-pressed={method === value} className={`return-method ${method === value ? 'is-active' : ''}`} onClick={() => onChange(value)} disabled={disabled}>
      <span className="return-method-icon"><Icon /></span><span className="return-method-copy"><strong>{title}</strong><small>{description}</small></span><span className="return-radio" aria-hidden="true" />
    </button>)}
  </div>
}
