function AlertMessage({ message, type }) {
  // Eğer mesaj boşsa hiçbir şey render etme (sayfadaki {message.text && ...} kontrolüne gerek kalmaz)
  if (!message) return null;

  const isSuccess = type === 'success';

  return (
    <div role={isSuccess ? 'status' : 'alert'} className={`p-4 rounded-xl text-sm font-bold border flex items-center shadow-sm animate-fade-in ${
      isSuccess 
        ? 'bg-green-50 text-green-700 border-green-200' 
        : 'bg-red-50 text-red-700 border-red-200'
    }`}>
      {/* Duruma göre dinamik ikon */}
      {isSuccess ? (
        <svg className="w-5 h-5 mr-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
        </svg>
      ) : (
        <svg className="w-5 h-5 mr-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
        </svg>
      )}
      <span>{message}</span>
    </div>
  );
}

export default AlertMessage;
