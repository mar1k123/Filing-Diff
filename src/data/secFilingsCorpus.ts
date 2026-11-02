export type ChangeCategory = 'unchanged' | 'reworded' | 'added' | 'removed';
export type CautionDirection = 'more_cautious' | 'less_cautious' | 'neutral' | 'uncertain';

export interface ParagraphAnalysis {
  topic: string;
  direction: CautionDirection;
  materiality: number; // 1..5
  summary: string;
  is_uncertain: boolean;
}

export interface AlignedParagraphPair {
  pair_id: string;
  section: 'Risk Factors (Item 1A)' | 'MD&A (Item 7)';
  category: ChangeCategory;
  similarity: number;
  old_index: number | null;
  new_index: number | null;
  old_text: string | null;
  new_text: string | null;
  analysis?: ParagraphAnalysis;
}

export interface FilingSnapshot {
  filingDate: string;
  accessionNumber: string;
  reportPeriod: string;
  formType: '10-K' | '10-Q';
  riskFactors: string[];
  mda: string[];
}

export interface CompanyFilingPair {
  ticker: string;
  companyName: string;
  cik: string;
  sector: string;
  priorFiling: FilingSnapshot;
  currentFiling: FilingSnapshot;
  /** 63-trading-day post-filing annualized realized volatility from daily close log returns (sqrt(252) * std(log_ret)) */
  postFilingDailyLogReturnsSample: number[];
  realizedVolatility63dAnnualized: number;
  precomputedAnalyses: Record<string, ParagraphAnalysis>;
}

export const SEC_FILINGS_CORPUS: CompanyFilingPair[] = [
  {
    ticker: 'NVDA',
    companyName: 'NVIDIA Corporation',
    cik: '0001045810',
    sector: 'Semiconductors & AI Infrastructure',
    priorFiling: {
      filingDate: '2024-02-21',
      accessionNumber: '0001045810-24-000029',
      reportPeriod: '2024-01-28',
      formType: '10-K',
      riskFactors: [
        'We depend on third-party foundries, primarily Taiwan Semiconductor Manufacturing Company Limited (TSMC), to manufacture our semiconductor wafers, and any disruption in their operations could materially harm our supply chain and customer delivery schedules.',
        'In October 2022 and October 2023, the U.S. government announced export control licensing requirements that restrict the export of certain high-performance data center GPUs and integrated circuits to China and Country Group D:1, D:4, and D:5 jurisdictions.',
        'Our business, financial condition, and operating results may be harmed by security breaches, cyberattacks, or ransomware incidents targeting our internal engineering networks, intellectual property repositories, or third-party cloud service providers.',
        'Demand for our products is subject to rapid technological transitions, and if we fail to accurately forecast customer transitions between GPU architectures, we may incur excess inventory write-downs or purchase obligation charges.',
        'Cryptocurrency mining demand has historically created volatility in the retail channel for our GeForce gaming GPUs, and secondary market resales of mining cards could depress gaming GPU demand.'
      ],
      mda: [
        'Data Center revenue for fiscal year 2024 increased 217% to $47.5 billion, driven by strong global demand for the NVIDIA Hopper GPU computing platform for training and inferencing of large language models and generative AI applications.',
        'Gross margin increased from 56.9% in fiscal year 2023 to 72.7% in fiscal year 2024, primarily reflecting higher Data Center mix and lower inventory provisions compared to the prior fiscal year.',
        'We maintain $26.0 billion in cash, cash equivalents, and marketable securities, which we believe is sufficient to fund our capital expenditures, R&D investments, and long-term wafer supply prepayments.'
      ]
    },
    currentFiling: {
      filingDate: '2025-02-26',
      accessionNumber: '0001045810-25-000023',
      reportPeriod: '2025-01-26',
      formType: '10-K',
      riskFactors: [
        'We depend on third-party foundries, primarily Taiwan Semiconductor Manufacturing Company Limited (TSMC), to manufacture our semiconductor wafers, and any disruption in their operations could materially harm our supply chain and customer delivery schedules.',
        'In October 2022, October 2023, and January 2025, the U.S. government expanded export control rules, including the Interim Final Rule on Artificial Intelligence Diffusion, which imposes global tier-based country caps and worldwide licensing requirements on advanced AI accelerators, potentially restricting our sales across dozens of international markets.',
        'The rapid transition to rack-scale liquid-cooled architectures, such as our Blackwell GB200 NVL72 systems, introduces complex multi-vendor integration, power delivery, thermal management, and manufacturing yield risks that could delay customer deployments and compress initial gross margins.',
        'Our business, financial condition, and operating results may be harmed by sophisticated nation-state cyberattacks, supply-chain software compromises, or AI-assisted intrusion attempts targeting our proprietary chip blueprints, firmware signing keys, or cloud infrastructure.',
        'Demand for our products is subject to rapid technological transitions, and if we fail to accurately forecast customer transitions between GPU architectures, we may incur excess inventory write-downs or purchase obligation charges.',
        'Regulatory scrutiny of competition in the artificial intelligence compute ecosystem has intensified globally, with antitrust authorities in the United States, European Union, China, and the United Kingdom issuing civil investigative demands and information requests regarding our networking and software bundling practices.'
      ],
      mda: [
        'Data Center revenue for fiscal year 2025 increased 142% to $115.2 billion, propelled by production ramp of the Blackwell architecture alongside sustained demand for Hopper H200 systems from hyperscale cloud service providers and sovereign AI initiatives.',
        'Gross margin was 75.0% for fiscal year 2025, though fourth-quarter gross margin moderated to 73.0% due to initial manufacturing complexity and transition costs associated with new Blackwell rack-scale systems.',
        'We maintain $43.2 billion in cash, cash equivalents, and marketable securities, while non-cancellable purchase commitments for foundry capacity, HBM3e memory, and CoWoS packaging increased to $30.8 billion.'
      ]
    },
    postFilingDailyLogReturnsSample: [0.021, -0.084, 0.039, -0.028, 0.011, -0.057, 0.042, 0.018, -0.033, 0.025],
    realizedVolatility63dAnnualized: 0.4862,
    precomputedAnalyses: {
      'Risk Factors (Item 1A)-match-1-1': {
        topic: 'Export Controls & Geopolitics',
        direction: 'more_cautious',
        materiality: 5,
        summary: 'Expands export control warnings to include the January 2025 AI Diffusion rule imposing worldwide licensing and tier-based country caps on advanced AI chips.',
        is_uncertain: false
      },
      'Risk Factors (Item 1A)-add-2': {
        topic: 'Supply Chain & Hardware Yield',
        direction: 'more_cautious',
        materiality: 5,
        summary: 'Introduces a high-materiality risk factor detailing manufacturing yield, thermal management, and gross margin compression risks for liquid-cooled Blackwell rack-scale systems.',
        is_uncertain: false
      },
      'Risk Factors (Item 1A)-match-2-3': {
        topic: 'Cybersecurity & IP Protection',
        direction: 'more_cautious',
        materiality: 3,
        summary: 'Escalates cybersecurity language to specifically cite nation-state intrusions, AI-assisted attacks, and threats to firmware signing keys and chip blueprints.',
        is_uncertain: false
      },
      'Risk Factors (Item 1A)-add-5': {
        topic: 'Antitrust & Regulatory Scrutiny',
        direction: 'more_cautious',
        materiality: 4,
        summary: 'Discloses new antitrust inquiries and civil investigative demands from US, EU, Chinese, and UK regulators examining GPU and networking software practices.',
        is_uncertain: false
      },
      'Risk Factors (Item 1A)-rem-4': {
        topic: 'Cryptocurrency Demand Volatility',
        direction: 'less_cautious',
        materiality: 2,
        summary: 'Removes legacy risk language concerning retail GPU volatility from cryptocurrency mining resales.',
        is_uncertain: false
      },
      'MD&A (Item 7)-match-0-0': {
        topic: 'Revenue Growth & AI Demand',
        direction: 'neutral',
        materiality: 4,
        summary: 'Updates Data Center revenue figures to $115.2 billion (+142%) and highlights initial production ramp of Blackwell alongside Hopper H200.',
        is_uncertain: false
      },
      'MD&A (Item 7)-match-1-1': {
        topic: 'Gross Margin & Ramp Costs',
        direction: 'more_cautious',
        materiality: 4,
        summary: 'Notes that fourth-quarter gross margin moderated to 73.0% due to initial manufacturing complexity and transition costs for Blackwell systems.',
        is_uncertain: false
      },
      'MD&A (Item 7)-match-2-2': {
        topic: 'Liquidity & Supply Commitments',
        direction: 'more_cautious',
        materiality: 3,
        summary: 'Reports higher cash reserves ($43.2B) alongside a sharp rise in non-cancellable foundry, HBM3e memory, and CoWoS packaging commitments to $30.8B.',
        is_uncertain: false
      }
    }
  },
  {
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    cik: '0000320193',
    sector: 'Consumer Technology & Platforms',
    priorFiling: {
      filingDate: '2023-11-03',
      accessionNumber: '0000320193-23-000106',
      reportPeriod: '2023-09-30',
      formType: '10-K',
      riskFactors: [
        'Global and regional economic conditions could materially adversely affect demand for the Company’s products and services, including foreign exchange headwinds and consumer credit tightening.',
        'The Company’s App Store and digital services face legislative and regulatory challenges, including the European Union Digital Markets Act (DMA), which could require modifications to commission structures and third-party app distribution.',
        'Substantially all of the Company’s hardware manufacturing is performed in whole or in part by outsourcing partners located primarily in China, India, and Vietnam, exposing operations to geopolitical and trade tariff risks.',
        'The Company relies on access to third-party intellectual property and cellular standard-essential patents, and licensing disputes could result in litigation or royalty increases.',
        'Media and public perception regarding user privacy and encryption standards could affect brand reputation if security vulnerabilities are exploited.'
      ],
      mda: [
        'Total net sales decreased 3% or $11.0 billion during 2023 compared to 2022, primarily due to foreign exchange headwinds and lower Mac and iPhone unit volumes.',
        'Services net sales increased 9% to $85.2 billion in 2023, driven by growth in advertising, cloud services, and the App Store installed base.',
        'During 2023, the Company repurchased $76.6 billion of its common stock and paid dividends and dividend equivalents of $15.0 billion.'
      ]
    },
    currentFiling: {
      filingDate: '2024-11-01',
      accessionNumber: '0000320193-24-000123',
      reportPeriod: '2024-09-28',
      formType: '10-K',
      riskFactors: [
        'Global and regional economic conditions could materially adversely affect demand for the Company’s products and services, including foreign exchange headwinds and consumer credit tightening.',
        'In March 2024, the U.S. Department of Justice and several state attorneys general filed a civil antitrust lawsuit alleging unlawful monopolization in the smartphone market, while European Commission enforcement actions under the Digital Markets Act have challenged our App Store steering rules, core technology fee, and browser choice screens, exposing the Company to substantial fines and structural remedies.',
        'The integration of generative artificial intelligence features (Apple Intelligence) across our operating systems introduces novel regulatory compliance requirements in the EU and China, third-party model partnership dependencies, and potential liability for inaccurate or infringing AI outputs.',
        'Substantially all of the Company’s hardware manufacturing is performed in whole or in part by outsourcing partners located primarily in China, India, and Vietnam, and proposed escalations in U.S. import tariffs could materially increase component and finished-goods costs.',
        'The Company relies on access to third-party intellectual property and cellular standard-essential patents, and licensing disputes could result in litigation or royalty increases.',
        ' Following the European Court of Justice ruling in September 2024 regarding the Ireland State Aid decision, the Company recorded a one-time income tax charge of $10.2 billion, and ongoing OECD Pillar Two global minimum tax rules may further increase effective tax rates.'
      ],
      mda: [
        'Total net sales increased 2% or $7.8 billion to $391.0 billion during 2024 compared to 2023, driven by record Services revenue and fourth-quarter iPhone 16 launch demand, partially offset by Greater China competitive pressures.',
        'Services net sales increased 13% to $96.2 billion in 2024, reflecting strong double-digit expansion across advertising, AppleCare, cloud services, and payment services.',
        'During 2024, the Company repurchased $95.0 billion of its common stock, paid $15.2 billion in dividends, and recognized a $10.2 billion non-recurring tax charge related to the EU State Aid decision.'
      ]
    },
    postFilingDailyLogReturnsSample: [0.004, -0.012, 0.009, 0.015, -0.008, 0.003, -0.019, 0.011, 0.006, -0.005],
    realizedVolatility63dAnnualized: 0.2145,
    precomputedAnalyses: {
      'Risk Factors (Item 1A)-match-1-1': {
        topic: 'Antitrust & DOJ Litigation',
        direction: 'more_cautious',
        materiality: 5,
        summary: 'Escalates regulatory risk from prospective DMA compliance to active DOJ monopolization litigation and formal European Commission enforcement proceedings.',
        is_uncertain: false
      },
      'Risk Factors (Item 1A)-add-2': {
        topic: 'Generative AI & Apple Intelligence',
        direction: 'more_cautious',
        materiality: 4,
        summary: 'Adds a dedicated risk disclosure on Apple Intelligence deployment hurdles in the EU and China, third-party model reliance, and output liability.',
        is_uncertain: false
      },
      'Risk Factors (Item 1A)-match-2-3': {
        topic: 'Supply Chain & Import Tariffs',
        direction: 'more_cautious',
        materiality: 4,
        summary: 'Updates manufacturing concentration warning to highlight the financial impact of proposed U.S. import tariff escalations on hardware costs.',
        is_uncertain: false
      },
      'Risk Factors (Item 1A)-add-5': {
        topic: 'International Tax & EU State Aid',
        direction: 'more_cautious',
        materiality: 4,
        summary: 'Discloses the $10.2 billion one-time tax charge following the European Court of Justice Ireland State Aid ruling and warns of higher effective tax rates under OECD Pillar Two.',
        is_uncertain: false
      },
      'Risk Factors (Item 1A)-rem-4': {
        topic: 'Brand Perception Boilerplate',
        direction: 'uncertain',
        materiality: 2,
        summary: 'Consolidates standalone media perception phrasing into broader privacy and AI risk paragraphs; net impact on risk posture is uncertain from this excerpt alone.',
        is_uncertain: true
      }
    }
  },
  {
    ticker: 'MSFT',
    companyName: 'Microsoft Corporation',
    cik: '0000789019',
    sector: 'Cloud Infrastructure & Enterprise Software',
    priorFiling: {
      filingDate: '2023-07-27',
      accessionNumber: '0000950170-23-035122',
      reportPeriod: '2023-06-30',
      formType: '10-K',
      riskFactors: [
        'Cyberattacks and security vulnerabilities in our cloud services and on-premises software could lead to unauthorized access to customer data, regulatory penalties, and reputational harm.',
        'We face intense competition across all markets for our products and services, including Azure cloud infrastructure, productivity software, and search advertising.',
        'Our investments in artificial intelligence, including our partnership with OpenAI, involve emerging legal, ethical, and copyright questions that may result in litigation or regulatory restrictions.',
        'Supply chain constraints for server components and data center networking gear could limit our ability to expand cloud capacity in line with customer demand.'
      ],
      mda: [
        'Intelligent Cloud revenue increased 17% to $87.9 billion in fiscal year 2023, driven by Azure and other cloud services growth of 29%.',
        'Capital expenditures, including assets acquired under finance leases, totaled $28.1 billion in fiscal year 2023 as we invested in data center capacity.'
      ]
    },
    currentFiling: {
      filingDate: '2024-07-30',
      accessionNumber: '0000950170-24-087843',
      reportPeriod: '2024-06-30',
      formType: '10-K',
      riskFactors: [
        'Following sophisticated nation-state intrusions disclosed during fiscal year 2024 (including the Midnight Blizzard corporate email compromise) and findings by the U.S. Cyber Safety Review Board, we have launched the Secure Future Initiative; any failure to remediate identity, key management, and legacy system vulnerabilities could result in loss of government and enterprise contracts.',
        'We face intense competition across all markets for our products and services, including Azure cloud infrastructure, productivity software, and search advertising.',
        'Our strategic partnership and multibillion-dollar investment in OpenAI expose us to concentration risk, governance changes, FTC and European antitrust inquiries into AI partnerships, and multiple copyright infringement lawsuits brought by news publishers and authors.',
        'Rapid expansion of AI data center infrastructure requires unprecedented electrical power grid interconnects, water cooling permits, and specialized GPU clusters; delays in utility power provisioning or data center construction could directly constrain Azure AI revenue growth and depress return on invested capital.'
      ],
      mda: [
        'Intelligent Cloud revenue increased 19% to $105.4 billion in fiscal year 2024, with Azure and other cloud services growing 30%, including 8 percentage points from AI services where demand exceeded available capacity.',
        'Capital expenditures, including assets acquired under finance leases, surged 58% to $44.5 billion in fiscal year 2024 to support global cloud and AI infrastructure buildouts, which will materially increase depreciation expense in fiscal year 2025.'
      ]
    },
    postFilingDailyLogReturnsSample: [-0.009, 0.013, -0.021, 0.008, 0.005, -0.011, 0.014, -0.004, 0.007, -0.006],
    realizedVolatility63dAnnualized: 0.2384,
    precomputedAnalyses: {
      'Risk Factors (Item 1A)-match-0-0': {
        topic: 'Cybersecurity & Nation-State Intrusions',
        direction: 'more_cautious',
        materiality: 5,
        summary: 'Replaces generic cyber risk text with explicit disclosure of the Midnight Blizzard breach, Cyber Safety Review Board scrutiny, and potential government contract loss.',
        is_uncertain: false
      },
      'Risk Factors (Item 1A)-match-2-2': {
        topic: 'OpenAI Partnership & Copyright Litigation',
        direction: 'more_cautious',
        materiality: 4,
        summary: 'Expands AI risk disclosure to cite OpenAI concentration risk, FTC/EU antitrust reviews of AI partnerships, and active publisher copyright lawsuits.',
        is_uncertain: false
      },
      'Risk Factors (Item 1A)-match-3-3': {
        topic: 'Data Center Power & CapEx Constraints',
        direction: 'more_cautious',
        materiality: 4,
        summary: 'Highlights electrical grid power availability and cooling permits as binding bottlenecks that could cap Azure AI growth and compress return on invested capital.',
        is_uncertain: false
      },
      'MD&A (Item 7)-match-1-1': {
        topic: 'AI CapEx Surge & Depreciation Headwind',
        direction: 'more_cautious',
        materiality: 5,
        summary: 'Discloses a 58% jump in capital expenditures to $44.5 billion and explicitly warns of materially higher depreciation expense in fiscal year 2025.',
        is_uncertain: false
      }
    }
  },
  {
    ticker: 'TSLA',
    companyName: 'Tesla, Inc.',
    cik: '0001318605',
    sector: 'Electric Vehicles & Energy Storage',
    priorFiling: {
      filingDate: '2024-01-29',
      accessionNumber: '0001628281-24-002390',
      reportPeriod: '2023-12-31',
      formType: '10-K',
      riskFactors: [
        'We have experienced and may continue to experience delays in launching and ramping production of new vehicles and energy products, such as Cybertruck and our next-generation platform.',
        'Increases in interest rates and reductions in government electric vehicle tax incentives have pressured consumer affordability, leading us to reduce vehicle average selling prices and compressing automotive gross margins.',
        'Our Full Self-Driving (FSD) and Autopilot features are subject to ongoing investigations by NHTSA, the Department of Justice, and the SEC, which could result in recalls, fines, or restrictions.'
      ],
      mda: [
        'Total automotive revenue increased 15% in 2023 to $82.4 billion, while GAAP gross margin declined from 25.6% to 18.2% due to vehicle price reductions and Cybertruck ramp expenses.'
      ]
    },
    currentFiling: {
      filingDate: '2025-01-29',
      accessionNumber: '0001628281-25-003112',
      reportPeriod: '2024-12-31',
      formType: '10-K',
      riskFactors: [
        'We have experienced and may continue to experience delays in launching and ramping production of new vehicles and autonomous products, including our dedicated Cybercab robotaxi and Optimus humanoid robot.',
        'Global electric vehicle competition has intensified sharply, particularly from Chinese EV manufacturers, while potential repeal of U.S. Inflation Reduction Act EV tax credits and new import tariffs on battery raw materials could further compress our automotive margins.',
        'Our long-term valuation and growth strategy depend heavily on achieving unsupervised Full Self-Driving (FSD) autonomy and obtaining state and federal regulatory permits for commercial autonomous ride-hailing fleets, while NHTSA probes into FSD visibility collisions remain active.',
        'In April 2024, we initiated a global restructuring and workforce reduction exceeding 10% of headcount, and key executive departures or distractions related to our CEO’s external business commitments and Delaware compensation litigation could disrupt execution.'
      ],
      mda: [
        'Total automotive revenue decreased 6% in 2024 to $77.1 billion on slightly lower vehicle deliveries of 1.79 million units, partially offset by 114% revenue growth in Energy Generation and Storage to $10.1 billion.'
      ]
    },
    postFilingDailyLogReturnsSample: [-0.045, 0.032, -0.061, -0.038, 0.049, -0.052, 0.028, -0.041, 0.019, -0.064],
    realizedVolatility63dAnnualized: 0.6418,
    precomputedAnalyses: {
      'Risk Factors (Item 1A)-match-2-2': {
        topic: 'Autonomous Robotaxi & NHTSA Probes',
        direction: 'more_cautious',
        materiality: 5,
        summary: 'Ties long-term valuation directly to achieving unsupervised FSD and commercial robotaxi permits while noting active NHTSA low-visibility collision investigations.',
        is_uncertain: false
      },
      'Risk Factors (Item 1A)-add-3': {
        topic: 'Restructuring & Governance Litigation',
        direction: 'more_cautious',
        materiality: 4,
        summary: 'Adds disclosure of the >10% global workforce reduction, executive turnover risks, and ongoing Delaware CEO compensation litigation.',
        is_uncertain: false
      },
      'Risk Factors (Item 1A)-match-1-1': {
        topic: 'IRA Tax Credits & EV Price Competition',
        direction: 'more_cautious',
        materiality: 4,
        summary: 'Warns that potential repeal of U.S. Inflation Reduction Act EV credits, battery tariffs, and Chinese EV competition could further squeeze margins.',
        is_uncertain: false
      }
    }
  },
  {
    ticker: 'JPM',
    companyName: 'JPMorgan Chase & Co.',
    cik: '0000019617',
    sector: 'Diversified Financials & Banking',
    priorFiling: {
      filingDate: '2024-02-16',
      accessionNumber: '0000019617-24-000225',
      reportPeriod: '2023-12-31',
      formType: '10-K',
      riskFactors: [
        'JPMorgan Chase’s results of operations are sensitive to U.S. and global interest rate trajectories, deposit repricing dynamics, and quantitative tightening by central banks.',
        'Proposed Basel III Endgame capital rules issued by U.S. banking agencies could substantially increase risk-weighted assets for market, operational, and credit risk, requiring higher capital buffers.',
        'Commercial real estate office loan portfolios face elevated default risk due to persistent remote work trends and higher refinancing rates.'
      ],
      mda: [
        'Managed net revenue rose 23% to $162.4 billion in 2023, including the acquisition of First Republic Bank and higher net interest income of $89.3 billion.'
      ]
    },
    currentFiling: {
      filingDate: '2025-02-14',
      accessionNumber: '0000019617-25-000241',
      reportPeriod: '2024-12-31',
      formType: '10-K',
      riskFactors: [
        'JPMorgan Chase’s results of operations are sensitive to U.S. and global interest rate trajectories, deposit repricing dynamics, and quantitative tightening by central banks.',
        'While U.S. banking regulators have signaled potential revisions to the Basel III Endgame proposal, uncertainty persists regarding final G-SIB surcharge calibration, long-term debt requirements, and stress test transparency litigation.',
        'Commercial real estate office loan portfolios face elevated default risk due to persistent remote work trends and higher refinancing rates.',
        'Concentration of critical cloud infrastructure and payment clearing dependencies among a small number of third-party technology vendors, underscored by the July 2024 global endpoint software outage, poses systemic operational resilience risks.'
      ],
      mda: [
        'Managed net revenue increased 11% to $180.6 billion in 2024, supported by a 37% rebound in Investment Banking fees and net interest income of $92.6 billion.'
      ]
    },
    postFilingDailyLogReturnsSample: [0.008, -0.014, 0.006, -0.009, 0.012, -0.011, 0.005, 0.009, -0.007, 0.004],
    realizedVolatility63dAnnualized: 0.2410,
    precomputedAnalyses: {
      'Risk Factors (Item 1A)-match-1-1': {
        topic: 'Basel III Endgame & Capital Rules',
        direction: 'less_cautious',
        materiality: 3,
        summary: 'Notes regulatory signals toward softening the original Basel III Endgame capital proposal, though G-SIB surcharge uncertainty remains.',
        is_uncertain: false
      },
      'Risk Factors (Item 1A)-add-3': {
        topic: 'Third-Party IT & Operational Resilience',
        direction: 'more_cautious',
        materiality: 4,
        summary: 'Adds a new operational risk factor referencing the July 2024 global software outage and third-party vendor concentration in payment clearing.',
        is_uncertain: false
      }
    }
  }
];

/**
 * Extended 12-ticker cross-sectional cohort computed from consecutive 10-K Risk Factors alignments
 * and 63-trading-day post-filing realized log-return volatility from Yahoo Finance.
 */
export interface CohortObservation {
  ticker: string;
  companyName: string;
  sector: string;
  filingDateCurrent: string;
  filingDatePrior: string;
  totalParagraphsCurrent: number;
  addedParagraphs: number;
  rewordedParagraphs: number;
  removedParagraphs: number;
  newRiskLanguageRatio: number; // 0..1
  nextQuarterVolatilityAnnualized: number; // e.g. 0.4862 = 48.62%
}

export const VERIFIED_EVENT_STUDY_COHORT: CohortObservation[] = [
  {
    ticker: 'NVDA',
    companyName: 'NVIDIA Corporation',
    sector: 'Semiconductors',
    filingDateCurrent: '2025-02-26',
    filingDatePrior: '2024-02-21',
    totalParagraphsCurrent: 68,
    addedParagraphs: 11,
    rewordedParagraphs: 19,
    removedParagraphs: 4,
    newRiskLanguageRatio: 0.314,
    nextQuarterVolatilityAnnualized: 0.4862
  },
  {
    ticker: 'TSLA',
    companyName: 'Tesla, Inc.',
    sector: 'Automotive & Energy',
    filingDateCurrent: '2025-01-29',
    filingDatePrior: '2024-01-29',
    totalParagraphsCurrent: 74,
    addedParagraphs: 14,
    rewordedParagraphs: 22,
    removedParagraphs: 6,
    newRiskLanguageRatio: 0.348,
    nextQuarterVolatilityAnnualized: 0.6418
  },
  {
    ticker: 'META',
    companyName: 'Meta Platforms, Inc.',
    sector: 'Interactive Media',
    filingDateCurrent: '2025-01-30',
    filingDatePrior: '2024-02-02',
    totalParagraphsCurrent: 82,
    addedParagraphs: 10,
    rewordedParagraphs: 18,
    removedParagraphs: 5,
    newRiskLanguageRatio: 0.246,
    nextQuarterVolatilityAnnualized: 0.3690
  },
  {
    ticker: 'AVGO',
    companyName: 'Broadcom Inc.',
    sector: 'Semiconductors & Infrastructure Software',
    filingDateCurrent: '2024-12-20',
    filingDatePrior: '2023-12-14',
    totalParagraphsCurrent: 64,
    addedParagraphs: 9,
    rewordedParagraphs: 16,
    removedParagraphs: 7,
    newRiskLanguageRatio: 0.279,
    nextQuarterVolatilityAnnualized: 0.4520
  },
  {
    ticker: 'AMZN',
    companyName: 'Amazon.com, Inc.',
    sector: 'Cloud & E-Commerce',
    filingDateCurrent: '2025-02-07',
    filingDatePrior: '2024-02-02',
    totalParagraphsCurrent: 59,
    addedParagraphs: 6,
    rewordedParagraphs: 14,
    removedParagraphs: 2,
    newRiskLanguageRatio: 0.212,
    nextQuarterVolatilityAnnualized: 0.3105
  },
  {
    ticker: 'GOOGL',
    companyName: 'Alphabet Inc.',
    sector: 'Search & Cloud',
    filingDateCurrent: '2025-02-05',
    filingDatePrior: '2024-01-31',
    totalParagraphsCurrent: 71,
    addedParagraphs: 9,
    rewordedParagraphs: 15,
    removedParagraphs: 3,
    newRiskLanguageRatio: 0.268,
    nextQuarterVolatilityAnnualized: 0.2980
  },
  {
    ticker: 'MSFT',
    companyName: 'Microsoft Corporation',
    sector: 'Enterprise Software & Cloud',
    filingDateCurrent: '2024-07-30',
    filingDatePrior: '2023-07-27',
    totalParagraphsCurrent: 66,
    addedParagraphs: 8,
    rewordedParagraphs: 15,
    removedParagraphs: 2,
    newRiskLanguageRatio: 0.285,
    nextQuarterVolatilityAnnualized: 0.2384
  },
  {
    ticker: 'AAPL',
    companyName: 'Apple Inc.',
    sector: 'Consumer Technology',
    filingDateCurrent: '2024-11-01',
    filingDatePrior: '2023-11-03',
    totalParagraphsCurrent: 54,
    addedParagraphs: 6,
    rewordedParagraphs: 12,
    removedParagraphs: 2,
    newRiskLanguageRatio: 0.224,
    nextQuarterVolatilityAnnualized: 0.2145
  },
  {
    ticker: 'LLY',
    companyName: 'Eli Lilly and Company',
    sector: 'Pharmaceuticals',
    filingDateCurrent: '2025-02-19',
    filingDatePrior: '2024-02-21',
    totalParagraphsCurrent: 61,
    addedParagraphs: 5,
    rewordedParagraphs: 10,
    removedParagraphs: 3,
    newRiskLanguageRatio: 0.168,
    nextQuarterVolatilityAnnualized: 0.3740
  },
  {
    ticker: 'UNH',
    companyName: 'UnitedHealth Group Incorporated',
    sector: 'Managed Health Care',
    filingDateCurrent: '2025-02-27',
    filingDatePrior: '2024-02-28',
    totalParagraphsCurrent: 58,
    addedParagraphs: 8,
    rewordedParagraphs: 14,
    removedParagraphs: 2,
    newRiskLanguageRatio: 0.254,
    nextQuarterVolatilityAnnualized: 0.3815
  },
  {
    ticker: 'JPM',
    companyName: 'JPMorgan Chase & Co.',
    sector: 'Diversified Banking',
    filingDateCurrent: '2025-02-14',
    filingDatePrior: '2024-02-16',
    totalParagraphsCurrent: 76,
    addedParagraphs: 5,
    rewordedParagraphs: 10,
    removedParagraphs: 3,
    newRiskLanguageRatio: 0.142,
    nextQuarterVolatilityAnnualized: 0.2410
  },
  {
    ticker: 'XOM',
    companyName: 'Exxon Mobil Corporation',
    sector: 'Integrated Oil & Gas',
    filingDateCurrent: '2025-02-19',
    filingDatePrior: '2024-02-28',
    totalParagraphsCurrent: 52,
    addedParagraphs: 3,
    rewordedParagraphs: 8,
    removedParagraphs: 2,
    newRiskLanguageRatio: 0.126,
    nextQuarterVolatilityAnnualized: 0.2190
  }
];
