interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon?: React.ReactNode;
  color?: string;
  onClick?: () => void;
}

export default function StatCard({ label, value, sub, icon, color = 'blue', onClick }: StatCardProps) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    red: 'bg-red-50 text-red-600',
    orange: 'bg-orange-50 text-orange-600',
    purple: 'bg-purple-50 text-purple-600',
    yellow: 'bg-yellow-50 text-yellow-600',
  };
  return (
    <div
      className={`bg-white rounded-xl p-5 shadow-sm border border-slate-100 ${onClick ? 'cursor-pointer hover:shadow-md hover:border-blue-200 transition-all' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-slate-500 font-medium">{label}</span>
        {icon && (
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colors[color] ?? colors.blue}`}>
            {icon}
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-slate-800">{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
      {onClick && <div className="text-xs text-blue-500 mt-1">Click to view ↗</div>}
    </div>
  );
}
