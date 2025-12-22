import React, { ReactNode } from 'react';
import { Sidebar } from './Sidebar';

interface LayoutProps {
    children: ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
    return (
        <div className="glass-container">
            <Sidebar />
            <main className="content">
                {children}
            </main>
        </div>
    );
};
