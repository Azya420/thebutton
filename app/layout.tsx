import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'The Button — Mały klik. Wielka seria.',description:'Jeden przycisk, raz dziennie. Buduj serię, rywalizuj ze znajomymi i znajdź swój codzienny rytuał.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pl"><body>{children}</body></html>;}
