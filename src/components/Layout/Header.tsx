import { Bell, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface HeaderProps {
  title: string;
  onMenuClick: () => void;
  alertCount: number;
}

export default function Header({ title, onMenuClick, alertCount }: HeaderProps) {
  const navigate = useNavigate();
  return (
    <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
        >
          <Menu size={20} />
        </button>
        <h1 className="text-lg font-semibold text-slate-800">{title}</h1>
      </div>
      <button
        onClick={() => navigate('/alerts')}
        className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100"
      >
        <Bell size={20} />
        {alertCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
            {alertCount > 9 ? '9+' : alertCount}
          </span>
        )}
      </button>
    </header>
  );
}
