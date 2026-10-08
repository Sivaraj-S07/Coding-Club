import { GraduationCap, Users } from 'lucide-react';
import Button from './ui/Button';
export default function AccountRoleSelector({value,onChange}) {
 return <div className="account-switch" role="group" aria-label="Account type">{[['student','Student',GraduationCap],['mentor','Mentor',Users]].map(([role,label,Icon])=><Button key={role} type="button" variant={value===role?'primary':'ghost'} icon={Icon} aria-pressed={value===role} onClick={()=>onChange(role)}>{label}</Button>)}</div>;
}
