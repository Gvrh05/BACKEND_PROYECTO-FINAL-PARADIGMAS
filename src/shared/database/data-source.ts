import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { getDatabaseOptions } from './database.config';

export default new DataSource(getDatabaseOptions());
