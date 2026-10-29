import { Module } from '@nestjs/common';
import { S3Module } from '../s3/s3.module';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';

@Module({
  imports: [S3Module],
  controllers: [CatalogController],
  providers: [CatalogService],
})
export class CatalogModule {}
