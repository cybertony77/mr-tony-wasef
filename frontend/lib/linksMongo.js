import { getMongoFromEnv } from './marketingPageMongo';

export { getMongoFromEnv };

export const LINKS_DOC_ID = 'links_singleton';

export function defaultLinksDoc() {
  return {
    _id: LINKS_DOC_ID,
    items: [],
  };
}
