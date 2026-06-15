import * as dotenv from 'dotenv';
import { resolve } from 'path';

dotenv.config({ path: resolve(import.meta.dirname, '../../../.env') });
