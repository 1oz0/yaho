/**
 * .env 를 **가장 먼저** 로드한다.
 *
 * 왜 별도 파일인가:
 *   AppModule 의 `imports` 배열은 클래스 데코레이터가 평가되는 시점(= 모듈 import 시점)에
 *   결정된다. ConfigModule 이 .env 를 읽는 건 그보다 나중이라, 그 시점에는
 *   `process.env.DEMO_MODE` 가 아직 비어 있다.
 *   DemoModule 을 조건부로 등록하려면 그 전에 .env 가 로드돼 있어야 한다.
 *
 *   app.module.ts 최상단에서 이 파일을 import 하면 데코레이터 평가 전에 실행된다.
 */
import * as dotenv from 'dotenv';

dotenv.config();

/** DEMO_MODE 가 켜져 있는가. 꺼져 있으면 /demo/* 라우트를 아예 등록하지 않는다. */
export function isDemoMode(): boolean {
  return String(process.env.DEMO_MODE ?? 'false').toLowerCase() === 'true';
}
