import { writeFile } from 'node:fs/promises';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { createApplication } from '../dist/app.js';
const app = await createApplication();
try {
  await app.init();
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Circle.social API')
      .setVersion('1')
      .addCookieAuth('circle_session')
      .build(),
  );
  await writeFile(
    '../../docs/api/openapi.json',
    JSON.stringify(document, null, 2) + '\n',
  );
  console.log(
    `OpenAPI exported (${Object.keys(document.paths).length} paths).`,
  );
} finally {
  await app.close();
}
