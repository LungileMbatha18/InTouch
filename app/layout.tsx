import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'IN TOUCH. — So, I have a question.', description: 'A little note, a little music, and one honest question.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
