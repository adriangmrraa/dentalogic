import React, { type ReactNode, useState } from 'react';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar */}
      <Sidebar 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} 
      />
      
      {/* Main Content */}
      <main 
        className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${
          sidebarCollapsed ? 'ml-16' : 'ml-64'
        }`}
      >
        {/* Top Header */}
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-medical-900">
              Sistema de Gestión Dental
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Tenant Selector */}
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg text-sm">
              <span className="text-gray-500">Sucursal:</span>
              <span className="font-medium text-medical-900">Principal</span>
            </div>
            
            {/* User Menu */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-medical-600 flex items-center justify-center text-white font-medium">
                A
              </div>
            </div>
          </div>
        </header>
        
        {/* Page Content */}
        <div className="flex-1 overflow-auto bg-gray-100 p-6">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
