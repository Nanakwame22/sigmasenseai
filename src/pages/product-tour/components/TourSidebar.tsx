interface TourModule {
  id: string;
  label: string;
  icon: string;
  color: string;
}

interface TourSidebarProps {
  modules: TourModule[];
  activeId: string;
  onSelect: (id: string) => void;
}

export default function TourSidebar({ modules, activeId, onSelect }: TourSidebarProps) {
  return (
    <aside className="w-72 xl:w-80 2xl:w-96 flex-shrink-0 sticky top-20 self-start hidden lg:block">
      <div className="bg-white border border-gray-200/80 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/60">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Platform Modules</p>
        </div>
        <nav className="p-2">
          {modules.map((mod, idx) => {
            const isActive = activeId === mod.id;
            return (
              <button
                key={mod.id}
                onClick={() => onSelect(mod.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-200 cursor-pointer group ${
                  isActive
                    ? 'bg-teal-50 text-teal-700'
                    : 'hover:bg-gray-50 text-gray-600 hover:text-gray-900'
                }`}
              >
                <div className={`w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 transition-all duration-200 ${
                  isActive ? mod.color : 'bg-gray-100 group-hover:bg-gray-200'
                }`}>
                  <i className={`${mod.icon} text-sm ${isActive ? 'text-white' : 'text-gray-500 group-hover:text-gray-700'}`}></i>
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold truncate ${isActive ? 'text-teal-700' : ''}`}>
                    {mod.label}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">Step {idx + 1}</div>
                </div>
                {isActive && (
                  <div className="w-1.5 h-1.5 rounded-full bg-teal-500 flex-shrink-0"></div>
                )}
              </button>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-gray-100">
          <a
            href="/auth/signup"
            className="block w-full text-center px-4 py-2.5 bg-gradient-to-r from-teal-600 to-teal-500 text-white text-sm font-bold rounded-xl hover:from-teal-500 hover:to-teal-400 transition-all duration-200 cursor-pointer whitespace-nowrap"
          >
            Start Free Trial
          </a>
        </div>
      </div>
    </aside>
  );
}
