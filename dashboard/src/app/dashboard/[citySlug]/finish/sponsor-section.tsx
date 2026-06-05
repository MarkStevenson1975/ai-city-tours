'use client';

// Sponsor crediting on the finish screen is not part of the MVP yet.
// Left in place but marked "coming soon".
export function SponsorSection() {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-2xl font-semibold">Sponsor</h2>
        <span className="text-[11px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 px-2 py-1 rounded-full">
          Coming soon
        </span>
      </div>
      <p className="text-sm text-gray-600">
        Soon you will be able to credit whoever is sponsoring this tour, such as
        your tourist information centre, business improvement district or a local
        supporter, on the finish screen. We are putting the finishing touches to
        this and it will be available shortly.
      </p>
    </div>
  );
}
