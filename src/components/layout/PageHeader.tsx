export function PageHeader() {
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-10xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex items-center gap-3">
          {/* <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
            </svg>
          </div> */}
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Transaction Tag Manager</h1>
            {/* <p className="text-xs text-gray-500">Build and manage tagging rules for your transactions</p> */}
          </div>
        </div>
      </div>
    </header>
  );
}
