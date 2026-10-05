// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Local/test-network partnership. Every financial mutation is partner-authorized.
contract Partnership {
    struct Partner { address wallet; uint256 expected; uint256 deposited; uint256 weight; bool signed; bool exited; }
    struct Expense { string title; string description; address recipient; uint256 amount; address creator; bool executed; bool cancelled; }
    struct Proposal { string title; string description; address creator; uint256 deadline; uint256 forWeight; uint256 againstWeight; uint256 totalWeight; uint256 threshold; bool closed; bool passed; }
    struct Exit { address partner; uint256 amount; string reason; bool settled; }
    string public name;
    uint256 public immutable quorum;
    uint256 public immutable endsAt;
    bool public active;
    uint256 public revenue;
    uint256 public spent;
    uint256 public distributed;
    uint256 public settledTotal;
    uint256 public profitReserve;
    Partner[] public partners;
    Expense[] public expenses;
    Proposal[] public proposals;
    Exit[] public exits;
    mapping(address => uint256) private partnerIndex;
    mapping(uint256 => mapping(address => uint8)) public expenseVotes;
    mapping(uint256 => mapping(address => uint8)) public votes;
    mapping(uint256 => mapping(address => uint256)) public voteWeights;
    mapping(uint256 => mapping(address => bool)) public exitApprovals;
    mapping(address => bool) public exitPending;
    bool private entered;
    event Activity(string action, address indexed actor, uint256 amount, uint256 indexed itemId);

    constructor(string memory n, address[] memory wallets, uint256[] memory expected, uint256[] memory weights, uint256 q, uint256 end) {
        require(bytes(n).length > 0 && bytes(n).length <= 100, 'Invalid name');
        require(wallets.length >= 2 && wallets.length <= 20 && wallets.length == expected.length && wallets.length == weights.length, 'Invalid partners');
        require(q >= 51 && q <= 100 && end > block.timestamp, 'Invalid rules');
        name = n; quorum = q; endsAt = end;
        uint256 total;
        for (uint256 i; i < wallets.length; i++) {
            require(wallets[i] != address(0) && partnerIndex[wallets[i]] == 0 && expected[i] > 0 && weights[i] > 0, 'Invalid partner');
            partnerIndex[wallets[i]] = i + 1;
            partners.push(Partner(wallets[i], expected[i], 0, weights[i], false, false));
            total += weights[i];
        }
        require(total == 10000, 'Ownership must total 100%');
    }
    modifier onlyPartner() { require(partnerIndex[msg.sender] > 0 && !partners[partnerIndex[msg.sender] - 1].exited, 'Partner required'); _; }
    modifier operational() { require(active && block.timestamp <= endsAt, 'Inactive or expired'); _; }
    modifier nonReentrant() { require(!entered, 'Reentrancy'); entered = true; _; entered = false; }
    function partnerCount() external view returns (uint256) { return partners.length; }
    function expenseCount() external view returns (uint256) { return expenses.length; }
    function proposalCount() external view returns (uint256) { return proposals.length; }
    function exitCount() external view returns (uint256) { return exits.length; }
    function liveCount() public view returns (uint256 count) { for (uint256 i; i < partners.length; i++) if (!partners[i].exited) count++; }
    function liveWeight() public view returns (uint256 weight) { for (uint256 i; i < partners.length; i++) if (!partners[i].exited) weight += partners[i].weight; }
    function updateProfit() private { uint256 costs = spent + distributed + settledTotal; profitReserve = revenue > costs ? revenue - costs : 0; }
    function requiredApprovals() public view returns (uint256) { return (liveCount() * quorum + 99) / 100; }
    function approveAgreement() external onlyPartner {
        require(!active && block.timestamp <= endsAt, 'Already active or expired');
        Partner storage p = partners[partnerIndex[msg.sender] - 1]; require(!p.signed, 'Already signed'); p.signed = true;
        emit Activity('Agreement signed', msg.sender, 0, 0);
        bool all = true; for (uint256 i; i < partners.length; i++) if (!partners[i].signed) all = false;
        if (all) { active = true; emit Activity('Partnership activated', msg.sender, 0, 0); }
    }
    function depositContribution() external payable onlyPartner operational {
        Partner storage p = partners[partnerIndex[msg.sender] - 1];
        require(msg.value > 0 && p.deposited + msg.value <= p.expected, 'Invalid contribution');
        p.deposited += msg.value; emit Activity('Contribution', msg.sender, msg.value, 0);
    }
    function proposeExpense(string calldata title, string calldata description, address recipient, uint256 amount) external onlyPartner operational {
        require(bytes(title).length > 0 && bytes(title).length <= 120 && bytes(description).length <= 2000 && recipient != address(0) && recipient != address(this) && amount > 0, 'Invalid expense');
        expenses.push(Expense(title, description, recipient, amount, msg.sender, false, false));
        emit Activity('Expense proposed', msg.sender, amount, expenses.length - 1);
    }
    function approveExpense(uint256 id, bool support) external onlyPartner operational {
        Expense storage e = expenses[id]; require(!e.executed && !e.cancelled && expenseVotes[id][msg.sender] == 0, 'Expense closed or already voted');
        expenseVotes[id][msg.sender] = support ? 1 : 2;
        uint256 rejects;
        for (uint256 i; i < partners.length; i++) if (!partners[i].exited && expenseVotes[id][partners[i].wallet] == 2) rejects++;
        if (rejects > liveCount() - requiredApprovals()) e.cancelled = true;
        emit Activity(support ? 'Expense approved' : 'Expense rejected', msg.sender, 0, id);
    }
    function expenseApprovalCount(uint256 id) public view returns (uint256 count) {
        for (uint256 i; i < partners.length; i++) if (!partners[i].exited && expenseVotes[id][partners[i].wallet] == 1) count++;
    }
    function executeExpense(uint256 id) external onlyPartner operational nonReentrant {
        Expense storage e = expenses[id]; require(!e.executed && !e.cancelled && expenseApprovalCount(id) >= requiredApprovals(), 'Quorum not reached');
        require(e.amount <= address(this).balance, 'Insufficient treasury');
        e.executed = true; spent += e.amount; updateProfit();
        (bool ok,) = e.recipient.call{value: e.amount}(''); require(ok, 'Transfer failed');
        emit Activity('Expense executed', msg.sender, e.amount, id);
    }
    function depositRevenue() external payable onlyPartner operational { require(msg.value > 0, 'Positive amount required'); revenue += msg.value; updateProfit(); emit Activity('Revenue', msg.sender, msg.value, 0); }
    function distributeProfit(uint256 amount) external onlyPartner operational nonReentrant {
        require(amount > 0 && amount <= profitReserve && amount <= address(this).balance, 'Insufficient profit');
        distributed += amount; updateProfit();
        uint256 weight = liveWeight(); uint256 paid; uint256 last;
        for (uint256 i; i < partners.length; i++) if (!partners[i].exited) last = i;
        for (uint256 i; i < partners.length; i++) if (!partners[i].exited) {
            uint256 share = i == last ? amount - paid : amount * partners[i].weight / weight;
            paid += share; (bool ok,) = partners[i].wallet.call{value: share}(''); require(ok, 'Transfer failed');
        }
        emit Activity('Profit distributed', msg.sender, amount, 0);
    }
    function createProposal(string calldata title, string calldata description, uint256 deadline) external onlyPartner operational {
        require(bytes(title).length > 0 && bytes(title).length <= 120 && bytes(description).length <= 2000 && deadline > block.timestamp && deadline <= block.timestamp + 30 days, 'Invalid proposal');
        proposals.push(Proposal(title, description, msg.sender, deadline, 0, 0, liveWeight(), quorum, false, false));
        uint256 id = proposals.length - 1;
        for (uint256 i; i < partners.length; i++) if (!partners[i].exited) voteWeights[id][partners[i].wallet] = partners[i].weight;
        emit Activity('Proposal created', msg.sender, 0, id);
    }
    function vote(uint256 id, bool support) external onlyPartner operational {
        Proposal storage p = proposals[id]; require(!p.closed && block.timestamp < p.deadline && votes[id][msg.sender] == 0 && voteWeights[id][msg.sender] > 0, 'Voting closed or already voted');
        votes[id][msg.sender] = support ? 1 : 2;
        if (support) p.forWeight += voteWeights[id][msg.sender]; else p.againstWeight += voteWeights[id][msg.sender];
        emit Activity(support ? 'Vote for' : 'Vote against', msg.sender, 0, id);
    }
    /// @notice Governance resolves a recorded decision; it does not execute arbitrary calls.
    function closeProposal(uint256 id) external onlyPartner {
        Proposal storage p = proposals[id]; require(!p.closed, 'Already closed');
        bool passed = p.forWeight * 100 >= p.totalWeight * p.threshold;
        bool rejected = p.againstWeight * 100 > p.totalWeight * (100 - p.threshold);
        require(passed || rejected || block.timestamp >= p.deadline, 'Voting still open');
        p.closed = true; p.passed = passed; emit Activity(passed ? 'Proposal passed' : 'Proposal rejected', msg.sender, 0, id);
    }
    function requestExit(uint256 amount, string calldata reason) external onlyPartner {
        require(active && liveCount() > 1 && !exitPending[msg.sender] && bytes(reason).length <= 2000, 'Exit unavailable');
        exitPending[msg.sender] = true; exits.push(Exit(msg.sender, amount, reason, false)); emit Activity('Exit requested', msg.sender, amount, exits.length - 1);
    }
    function approveExit(uint256 id) external onlyPartner {
        Exit storage e = exits[id]; require(!e.settled && e.partner != msg.sender && !exitApprovals[id][msg.sender], 'Invalid approval');
        exitApprovals[id][msg.sender] = true; emit Activity('Exit approved', msg.sender, 0, id);
    }
    function exitApprovalCount(uint256 id) public view returns (uint256 count) { for (uint256 i; i < partners.length; i++) if (!partners[i].exited && exitApprovals[id][partners[i].wallet]) count++; }
    function settleExit(uint256 id) external onlyPartner nonReentrant {
        Exit storage e = exits[id]; require(!e.settled && liveCount() > 1 && !partners[partnerIndex[e.partner] - 1].exited, 'Exit unavailable');
        require(exitApprovalCount(id) >= ((liveCount() - 1) * quorum + 99) / 100, 'Exit quorum not reached');
        require(e.amount <= address(this).balance, 'Insufficient treasury');
        e.settled = true; partners[partnerIndex[e.partner] - 1].exited = true; exitPending[e.partner] = false;
        settledTotal += e.amount; updateProfit();
        (bool ok,) = e.partner.call{value: e.amount}(''); require(ok, 'Transfer failed'); emit Activity('Exit settled', msg.sender, e.amount, id);
    }
}

contract PartnershipFactory {
    mapping(address => bool) public isPartnership;
    event PartnershipCreated(address indexed partnership, address indexed creator, string name);
    function createPartnership(string calldata name, address[] calldata wallets, uint256[] calldata expected, uint256[] calldata weights, uint256 quorum, uint256 endsAt) external returns (address) {
        bool included; for (uint256 i; i < wallets.length; i++) if (wallets[i] == msg.sender) included = true;
        require(included, 'Creator must be a partner');
        Partnership p = new Partnership(name, wallets, expected, weights, quorum, endsAt);
        isPartnership[address(p)] = true; emit PartnershipCreated(address(p), msg.sender, name); return address(p);
    }
}
