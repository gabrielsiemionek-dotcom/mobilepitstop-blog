// Site settings for the MobilePitStop blog.
// Edit these, push to GitHub, and the site rebuilds on its own.

export default {
  // Where the blog lives. Set this to the custom domain you add in GitHub Pages.
  siteUrl: process.env.SITE_URL || 'https://blog.mobilepitstop.uk',

  blogName: 'MobilePitStop Blog',
  indexHeading: 'Car care advice from people who do it every day',
  blogDescription:
    'Practical tips on cleaning, protecting and looking after your car, from the MobilePitStop team in Cheshire, Merseyside and Flintshire.',

  // Articles in this language sit at the root (/my-article/).
  // Any other language gets its own folder (/de/my-article/), so languages never mix.
  defaultLanguage: 'en',
  locale: 'en_GB',
  dateLocale: 'en-GB',

  postsPerPage: 24,

  business: {
    name: 'MobilePitStop - Valeting & Detailing',
    shortName: 'MobilePitStop',
    url: 'https://mobilepitstop.uk/',
    logoUrl:
      'https://images.squarespace-cdn.com/content/v1/688cfa04caff54312a009f41/e6514019-fe3e-421a-b28e-3f2a75a96c43/MobilePitStop+Logo+-+Transparent.png?format=300w',
    phoneDisplay: '07592 196929',
    phoneTel: '+447592196929',
    email: 'mobilepitstopvalet@gmail.com',
    address: '86a Wolverham Road, Ellesmere Port, CH65 5BY',
    areas: 'Cheshire, Merseyside and Flintshire',
  },

  nav: [
    { label: 'Services', url: 'https://mobilepitstop.uk/all-services' },
    { label: 'Reviews', url: 'https://mobilepitstop.uk/reviews' },
    { label: 'FAQs', url: 'https://mobilepitstop.uk/faqs' },
  ],

  // Shown as the author in each post's structured data. Set to null to credit the business instead.
  author: { name: 'Gabriel Siemionek', jobTitle: 'Founder, MobilePitStop' },

  // The button in the header and the box at the end of every article.
  // A post can override the end-of-article box with its own "cta" in post.json.
  cta: {
    heading: 'Want it done for you?',
    text: 'We come to your home or workplace across Cheshire, Merseyside and Flintshire. Pick your service, answer a few quick questions and book online.',
    buttonLabel: 'Book a valet',
    buttonUrl: 'https://mobilepitstop.uk/all-services',
  },

  footerLinks: [
    { label: 'Main website', url: 'https://mobilepitstop.uk/' },
    { label: 'Contact', url: 'https://mobilepitstop.uk/contact-we-respond-24/7' },
    { label: 'Privacy & Cookie Policy', url: 'https://mobilepitstop.uk/privacy-policy-cookie-policy' },
    { label: 'Terms & Conditions', url: 'https://mobilepitstop.uk/terms-conditions' },
  ],
};
