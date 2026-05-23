import { create } from 'zustand';

interface UiState {
  /** The sender DID of the pending request whose approval sheet is open. */
  approvalSenderDid: string | null;
  openApproval: (senderDid: string) => void;
  closeApproval: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  approvalSenderDid: null,
  openApproval: (senderDid) => set({ approvalSenderDid: senderDid }),
  closeApproval: () => set({ approvalSenderDid: null }),
}));
