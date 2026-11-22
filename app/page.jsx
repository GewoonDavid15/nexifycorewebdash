import {cookies} from 'next/headers';
import {isSession,COOKIE} from '../lib/security.js';
import Dashboard from './ui.jsx';
export const dynamic='force-dynamic';
export default async function Home(){
  const cookieStore=await cookies();
  return <Dashboard initialAuthorized={isSession(cookieStore.get(COOKIE)?.value)}/>;
}
