import './styles.css';

export const metadata={
  title:'Nexify Enterprise | Control Center',
  description:'Beveiligd beheer voor jouw Nexify Minecraft-server en MC-Node-hosting',
  robots:{index:false,follow:false},
  applicationName:'Nexify Enterprise'
};
export const viewport={themeColor:'#080e1b',width:'device-width',initialScale:1};
export default function RootLayout({children}){
  return <html lang="nl"><body>{children}</body></html>;
}
