import { Link } from 'react-router-dom';
import { Users, ArrowUpRight } from 'lucide-react';
import Button from './ui/Button';
export default function TeamDashboardSection(){return <section className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b hairline pb-7"><div className="flex items-center gap-4"><span className="team-avatar"><Users size={22}/></span><div><h2 className="font-display text-xl font-semibold">Team workspace</h2><p className="mt-1 text-sm text-ink-500">Members, mentors, projects & tasks</p></div></div><Link to="/teams"><Button icon={ArrowUpRight} variant="secondary">Open teams</Button></Link></section>;}
