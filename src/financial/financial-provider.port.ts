/**
 * 금융 데이터 프로바이더 포트.
 *
 * 서비스 코드는 mock_* 테이블을 **직접 조회하지 않는다.** 반드시 이 포트를 거친다.
 * 나중에 실제 마이데이터 API 가 붙으면 RealFinancialProvider 를 만들어
 * FINANCIAL_PROVIDER 토큰의 바인딩만 갈아끼우면 된다 (§4-2).
 *
 * 기관 식별자로 cuid(`MockInstitution.id`) 가 아니라 **code**(`"SHINHAN_CARD"`)를 쓴다.
 * id 는 재시드할 때마다 바뀌어서 프론트가 하드코딩할 수 없기 때문이다.
 * 발표 전 재시드가 잦은 프로젝트라 이 차이가 실제로 중요하다.
 */

export const FINANCIAL_PROVIDER = Symbol('FINANCIAL_PROVIDER');

export interface ProviderInstitution {
  code: string;
  name: string;
  /** "CARD" | "BANK" */
  type: string;
  logoKey: string;
  brandColor: string;
  sortOrder: number;
}

export interface ProviderCredential {
  loginId: string;
  password: string;
}

/**
 * 인증 후 발급되는 세션.
 *
 * sessionKey 는 **stateless** 하게 만든다(내용을 인코딩해 담는다).
 * 서버를 재시작해도 DB 에 저장된 기존 Connection 의 세션이 계속 유효해야 하기 때문이다.
 * 인메모리 Map 에 담으면 재기동 직후 동기화가 전부 깨진다 — 발표 중에 겪으면 안 되는 일이다.
 */
export interface ProviderSession {
  sessionKey: string;
  institutionCode: string;
  ownerName: string;
}

export interface ProviderAccount {
  /** 프로바이더 쪽 계좌 식별자 */
  providerAccountId: string;
  /** "CARD" | "BANK" */
  type: string;
  accountNumberMasked: string;
  productName: string;
  ownerName: string;
  isOwnAccount: boolean;
}

/**
 * 프로바이더가 주는 원본 거래.
 * 실제 카드 명세서 수준의 필드만 존재한다 — **카테고리는 없다.**
 */
export interface ProviderTransaction {
  providerTxId: string;
  providerAccountId: string;
  approvedAt: Date;
  merchantName: string;
  amount: number;
  txType: string;
  mcc: string | null;
  installmentMonths: number;
  memo: string | null;
  approvalNo: string | null;
  counterpartKey: string | null;
}

export interface FinancialProviderPort {
  /** 연동 가능한 기관 목록 */
  listInstitutions(): Promise<ProviderInstitution[]>;

  /** 기관 로그인. 실패하면 AppException('PROVIDER_AUTH_FAILED') 을 던진다. */
  authenticate(institutionCode: string, credential: ProviderCredential): Promise<ProviderSession>;

  /** 세션에 딸린 계좌·카드 목록 */
  listAccounts(session: ProviderSession): Promise<ProviderAccount[]>;

  /** 기간 내 거래 조회. from 이상 to 미만. */
  fetchTransactions(
    session: ProviderSession,
    providerAccountId: string,
    from: Date,
    to: Date,
  ): Promise<ProviderTransaction[]>;

  /** 저장된 sessionKey 를 세션 객체로 복원한다 (서버 재기동 후 동기화용) */
  restoreSession(sessionKey: string): Promise<ProviderSession>;
}
