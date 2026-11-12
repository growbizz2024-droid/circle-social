import 'dotenv/config';
import { parseEnvironment } from '@circle/config';
export const environment = parseEnvironment(process.env);
